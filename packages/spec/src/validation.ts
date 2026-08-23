import type { Catalog, ComponentRegistration } from "@structile/catalog";
import type { ApplicationSpecification } from "./contracts.js";
import { SpecificationError } from "./errors.js";
import { LIMITS } from "./limits.js";
import { SUPPORTED_SPEC_MAJORS, SPEC_SCHEMA_VERSION, type ContractVersion } from "./version.js";

/** Keys that mutate a prototype chain when a parsed document is merged or indexed. */
const POLLUTION_KEYS: readonly string[] = Object.freeze(["__proto__", "constructor", "prototype"]);

/**
 * A specification is untrusted data loaded from a tenant database. These payload classes
 * are refused outright rather than escaped, because the runtime must never be in a
 * position where correct escaping is what stands between a spec and code execution.
 */
const FORBIDDEN_VALUE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = Object.freeze([
  ["markup", /<\/?[a-z]/i],
  ["javascript-scheme", /javascript\s*:/i],
  ["data-scheme", /data\s*:/i],
  ["event-handler", /\bon[a-z]+\s*=/i],
  ["css-expression", /expression\s*\(/i],
  ["url-function", /url\s*\(/i],
  ["template", /\{\{|\}\}/],
  ["sql-metacharacter", /(?:--|;|\/\*|\*\/|\bunion\b|\bselect\b|\bdrop\b|\bdelete\b|\binsert\b)/i],
  ["absolute-url", /^[a-z][a-z0-9+.-]*:\/\//i],
  ["scheme-relative-url", /^\/\//]
] as const);

/**
 * The published schemas set additionalProperties:false at every level. The validator must
 * agree: an unknown key in stored data means the writer and this reader disagree about the
 * grammar, and silently ignoring it is how a spec means one thing here and another there.
 */
const APPLICATION_KEYS: readonly string[] = Object.freeze(["specVersion", "id", "title", "pages", "themeRef"]);
const PAGE_KEYS: readonly string[] = Object.freeze(["id", "path", "titleKey", "nodes"]);
const NODE_KEYS: readonly string[] = Object.freeze(["componentId", "props", "slots", "queryRef", "actionRef"]);

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, violations: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) violations.push(`${path}: unknown property ${key}`);
  }
}

const IDENTIFIER = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/;
const ROUTE_PATH = /^\/[A-Za-z0-9\-/]*$/;
const MAX_STRING_LENGTH = 4_096;
const UTF8 = new TextEncoder();

/**
 * Duplicated per package on purpose. `architecture/package-boundaries.json` fixes the
 * thirteen package names and ARCH-001 asserts that exact list, so there is no shared
 * utility package to host this; importing it across packages would add dependency edges
 * between contract packages to save three lines. Keep the implementations identical.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reject anything that is not JSON data, at any depth, before interpreting the tree. */
function scanData(value: unknown, path: string, depth: number, violations: string[]): void {
  if (depth > LIMITS.maxStructuralDepth) {
    violations.push(`${path}: exceeds maxStructuralDepth`);
    return;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) violations.push(`${path}: non-finite number`);
    return;
  }
  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) { violations.push(`${path}: string exceeds ${MAX_STRING_LENGTH}`); return; }
    for (const [name, pattern] of FORBIDDEN_VALUE_PATTERNS) {
      if (pattern.test(value)) { violations.push(`${path}: forbidden payload (${name})`); return; }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) scanData(item, `${path}[${index}]`, depth + 1, violations);
    return;
  }
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      if (POLLUTION_KEYS.includes(key)) { violations.push(`${path}.${key}: prototype pollution`); continue; }
      scanData(value[key], `${path}.${key}`, depth + 1, violations);
    }
    return;
  }
  violations.push(`${path}: ${typeof value} is not specification data`);
}

interface WalkState {
  nodes: number;
  cost: number;
}

function walkNodes(
  nodes: unknown, catalog: ReadonlyMap<string, ComponentRegistration>,
  path: string, depth: number, state: WalkState, violations: string[]
): void {
  if (!Array.isArray(nodes)) { violations.push(`${path}: nodes must be an array`); return; }
  if (depth > LIMITS.maxDepth) { violations.push(`${path}: exceeds maxDepth`); return; }
  for (const [index, node] of nodes.entries()) {
    const at = `${path}[${index}]`;
    state.nodes += 1;
    if (state.nodes > LIMITS.maxNodes) { violations.push(`${at}: exceeds maxNodes`); return; }
    if (!isRecord(node)) { violations.push(`${at}: node must be an object`); continue; }
    rejectUnknownKeys(node, NODE_KEYS, at, violations);

    const registration = typeof node.componentId === "string" ? catalog.get(node.componentId) : undefined;
    if (!registration) { violations.push(`${at}: unknown componentId ${String(node.componentId)}`); continue; }

    state.cost += registration.cost.staticWeight;
    if (state.cost > LIMITS.maxCost) { violations.push(`${at}: exceeds maxCost`); return; }

    const allowedProps = new Set(Object.keys(registration.props.properties));
    const props = node.props;
    if (props !== undefined && !isRecord(props)) violations.push(`${at}: props must be an object`);
    else if (isRecord(props)) {
      for (const name of Object.keys(props)) {
        if (!allowedProps.has(name)) violations.push(`${at}: unknown prop ${name} for ${registration.id}`);
      }
      for (const name of registration.props.required ?? []) {
        if (!Object.hasOwn(props, name)) violations.push(`${at}: missing required prop ${name}`);
      }
    }

    const declaredSlots = new Map(registration.slots.map((slot) => [slot.name, slot]));
    const slots = node.slots;
    if (slots !== undefined && !isRecord(slots)) violations.push(`${at}: slots must be an object`);
    else if (isRecord(slots)) {
      for (const [name, children] of Object.entries(slots)) {
        const declared = declaredSlots.get(name);
        if (!declared) { violations.push(`${at}: undeclared slot ${name} on ${registration.id}`); continue; }
        if (Array.isArray(children) && children.length > declared.maxChildren) {
          violations.push(`${at}.${name}: exceeds slot maxChildren ${declared.maxChildren}`);
        }
        walkNodes(children, catalog, `${at}.${name}`, depth + 1, state, violations);
      }
    }
  }
}

/** Fail closed on any major this runtime cannot read. */
export function negotiateSpecVersion(requested: unknown): ContractVersion {
  if (!isRecord(requested) || !Number.isInteger(requested.major)) {
    throw new SpecificationError(["specVersion must declare an integer major"]);
  }
  if (!SUPPORTED_SPEC_MAJORS.includes(requested.major as number)) {
    throw new SpecificationError([
      `unsupported specification major ${String(requested.major)}; supported: ${SUPPORTED_SPEC_MAJORS.join(", ")}`
    ]);
  }
  return Object.freeze({ major: requested.major as number, minor: SPEC_SCHEMA_VERSION.minor });
}

export interface ValidateOptions {
  readonly catalog: Catalog;
}

/** Validate a stored specification. Returns a detached, data-only copy. */
export function validateSpecification(value: unknown, options: ValidateOptions): ApplicationSpecification {
  if (!isRecord(value)) throw new SpecificationError(["specification must be an object"]);

  let serialised: string | undefined;
  try {
    serialised = JSON.stringify(value);
  } catch (error) {
    const failure = error as { message?: string };
    throw new SpecificationError([`specification must be JSON-serialisable: ${String(failure.message ?? error)}`]);
  }
  if (serialised === undefined) throw new SpecificationError(["specification must be JSON-serialisable"]);
  // TextEncoder, not Buffer: this validator also runs in the browser runtime at G3.
  if (UTF8.encode(serialised).length > LIMITS.maxBytes) {
    throw new SpecificationError([`specification exceeds maxBytes (${LIMITS.maxBytes})`]);
  }

  const violations: string[] = [];
  for (const key of POLLUTION_KEYS) {
    if (Object.hasOwn(value, key)) violations.push(`${key}: prototype pollution`);
  }
  rejectUnknownKeys(value, APPLICATION_KEYS, "$", violations);
  scanData(value, "$", 0, violations);

  try {
    negotiateSpecVersion(value.specVersion);
  } catch (error) {
    violations.push(...(error as SpecificationError).violations);
  }

  if (typeof value.id !== "string" || !IDENTIFIER.test(value.id)) violations.push("id must be a stable identifier");
  if (typeof value.title !== "string" || value.title.length === 0) violations.push("title is required");

  const catalog = new Map((options.catalog?.components ?? []).map((item) => [item.id, item]));
  if (!Array.isArray(value.pages)) violations.push("pages must be an array");
  else {
    const state: WalkState = { nodes: 0, cost: 0 };
    const seenPaths = new Set<string>();
    for (const [index, page] of value.pages.entries()) {
      const at = `$.pages[${index}]`;
      if (!isRecord(page)) { violations.push(`${at}: page must be an object`); continue; }
      rejectUnknownKeys(page, PAGE_KEYS, at, violations);
      if (typeof page.id !== "string" || !IDENTIFIER.test(page.id)) violations.push(`${at}: invalid page id`);
      if (typeof page.path !== "string" || !ROUTE_PATH.test(page.path)) violations.push(`${at}: invalid route path`);
      else {
        if (seenPaths.has(page.path)) violations.push(`${at}: duplicate route ${page.path}`);
        seenPaths.add(page.path);
      }
      walkNodes(page.nodes, catalog, `${at}.nodes`, 1, state, violations);
    }
  }

  if (violations.length > 0) throw new SpecificationError([...new Set(violations)]);
  return JSON.parse(serialised) as ApplicationSpecification;
}
