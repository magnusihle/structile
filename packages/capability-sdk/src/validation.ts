import type { ActionDeclaration, ActionRisk, CapabilityManifest } from "./contracts.js";
import { CapabilityContractError, CapabilityErrorCode } from "./errors.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "./protocol.js";

/** Manifest keys, in the order the published contract lists them. */
export const MANIFEST_KEYS: readonly string[] = Object.freeze([
  "contractVersion", "resources", "fields", "metrics", "filters",
  "relationships", "queries", "exports", "actions", "signature"
]);

/** The published schemas set additionalProperties:false; the validators must agree. */
function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], violations: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) violations.push(`unknown property ${key}`);
  }
}

const ACTION_FIELDS: readonly string[] = Object.freeze([
  "id", "version", "input", "output", "permissions", "scope", "risk", "preview",
  "idempotency", "concurrency", "maxBatchSize", "mode", "timeoutMs", "retry", "audit", "redaction"
]);

const RISKS: readonly ActionRisk[] = Object.freeze(["normal", "destructive", "bulk", "high-impact"]);
const MODES = Object.freeze(["sync", "async"]);
const RETRY = Object.freeze(["retryable", "non-retryable"]);
const KEY_RULES = Object.freeze(["client-supplied", "derived"]);

/**
 * Scope kinds that would let an action reach outside the records it declares. An action
 * mutates application records; anything that names code, a query language, a network
 * destination or infrastructure is a different thing wearing an action's clothes.
 */
const FORBIDDEN_SCOPE_KINDS: readonly string[] = Object.freeze([
  "code", "script", "eval", "sql", "query", "network", "http", "url", "infrastructure", "shell", "file"
]);

const ACTION_ID = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;
const IDENTIFIER = /^[a-z][a-zA-Z0-9_]*$/;
const MAX_BATCH = 1_000;
const MAX_TIMEOUT_MS = 300_000;

/**
 * Duplicated per package on purpose. `architecture/package-boundaries.json` fixes the
 * thirteen package names and ARCH-001 asserts that exact list, so there is no shared
 * utility package to host this; importing it across packages would add dependency edges
 * between contract packages to save three lines. Keep the implementations identical.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function fail(code: keyof typeof CapabilityErrorCode, violations: readonly string[], requestId?: string): never {
  throw new CapabilityContractError(code, violations, requestId);
}

/** Validate a capability manifest. Fails closed on version, shape and signature. */
export function validateCapabilityManifest(value: unknown, requestId?: string): CapabilityManifest {
  if (!isRecord(value)) fail("MALFORMED_MANIFEST", ["manifest must be an object"], requestId);

  const version = value.contractVersion;
  if (!isRecord(version) || !Number.isInteger(version.major) || (version.major as number) < 1
      || !Number.isInteger(version.minor) || (version.minor as number) < 0) {
    fail("MALFORMED_MANIFEST", ["contractVersion must declare a positive integer major and a non-negative minor"], requestId);
  }
  if (!SUPPORTED_PROTOCOL_VERSIONS.some((supported) => supported.major === version.major)) {
    fail("UNSUPPORTED_CONTRACT_VERSION", [`major ${String(version.major)} is not supported`], requestId);
  }

  const missing = MANIFEST_KEYS.filter((key) => !Object.hasOwn(value, key));
  if (missing.length > 0) fail("MALFORMED_MANIFEST", missing.map((key) => `missing ${key}`), requestId);

  if (typeof value.signature !== "string" || value.signature.length === 0) {
    fail("UNSIGNED_MANIFEST", ["signature is required"], requestId);
  }

  const violations: string[] = [];
  rejectUnknownKeys(value, MANIFEST_KEYS, violations);
  for (const key of ["fields", "metrics", "filters", "queries", "exports", "actions"]) {
    if (!isStringArray(value[key])) violations.push(`${key} must be an array of strings`);
  }
  if (!Array.isArray(value.resources)) violations.push("resources must be an array");
  else for (const resource of value.resources) {
    if (!isRecord(resource) || typeof resource.name !== "string" || resource.name.length === 0
        || !isStringArray(resource.fields)) {
      violations.push("each resource needs a non-empty name and a string field list");
    }
  }
  if (!Array.isArray(value.relationships)) violations.push("relationships must be an array");
  else {
    const resourceNames = new Set(
      (Array.isArray(value.resources) ? value.resources : [])
        .filter(isRecord).map((resource) => String(resource.name)));
    for (const relationship of value.relationships) {
      if (!isRecord(relationship) || typeof relationship.name !== "string") {
        violations.push("each relationship needs a name"); continue;
      }
      // A join that does not resolve to declared resources is an undeclared join.
      for (const end of ["from", "to"] as const) {
        const target = relationship[end];
        if (typeof target !== "string" || !resourceNames.has(target)) {
          violations.push(`relationship ${relationship.name}: ${end} does not name a declared resource`);
        }
      }
    }
  }
  if (violations.length > 0) fail("MALFORMED_MANIFEST", violations, requestId);
  return value as unknown as CapabilityManifest;
}

/** Validate one action declaration against every ACT-001 obligation. */
export function validateActionDeclaration(value: unknown, requestId?: string): ActionDeclaration {
  if (!isRecord(value)) fail("MALFORMED_MANIFEST", ["declaration must be an object"], requestId);
  const violations: string[] = [];
  rejectUnknownKeys(value, ACTION_FIELDS, violations);

  for (const field of ACTION_FIELDS) {
    if (value[field] === undefined) violations.push(`missing ${field}`);
  }

  if (value.id !== undefined && (typeof value.id !== "string" || !ACTION_ID.test(value.id))) {
    violations.push("id must be stable dotted lowercase");
  }
  if (value.version !== undefined && (!isRecord(value.version) || !Number.isInteger(value.version.major)
      || (value.version.major as number) < 1 || !Number.isInteger(value.version.minor)
      || (value.version.minor as number) < 0)) {
    violations.push("version must declare a positive integer major and a non-negative minor");
  }
  for (const shape of ["input", "output"] as const) {
    const schema = value[shape];
    if (schema !== undefined && (!isRecord(schema) || schema.type !== "object" || !isRecord(schema.properties))) {
      violations.push(`${shape} must be a JSON Schema object`);
    }
  }
  if (value.permissions !== undefined && !isStringArray(value.permissions)) {
    violations.push("permissions must be an array of strings");
  }
  if (value.risk !== undefined && !RISKS.includes(value.risk as ActionRisk)) {
    violations.push(`risk must be one of ${RISKS.join(", ")}`);
  }
  if (value.mode !== undefined && !MODES.includes(value.mode as string)) {
    violations.push(`mode must be one of ${MODES.join(", ")}`);
  }

  if (value.scope !== undefined) {
    if (!Array.isArray(value.scope) || value.scope.length === 0) violations.push("scope must be a non-empty array");
    else for (const entry of value.scope) {
      if (!isRecord(entry) || typeof entry.kind !== "string"
          || typeof entry.value !== "string" || entry.value.length === 0) {
        violations.push("each scope needs a kind and a non-empty value"); continue;
      }
      if (FORBIDDEN_SCOPE_KINDS.includes(entry.kind.toLowerCase())) {
        violations.push(`forbidden scope kind ${entry.kind}: actions may only target records`);
      } else if (entry.kind !== "resource" && entry.kind !== "record") {
        violations.push(`unknown scope kind ${entry.kind}`);
      }
    }
  }

  if (value.preview !== undefined) {
    const preview = value.preview;
    if (!isRecord(preview) || typeof preview.required !== "boolean"
        || typeof preview.effectSummary !== "string" || preview.effectSummary.trim().length === 0) {
      // An empty summary defeats the purpose: preview exists so a human can read what the
      // action will do before confirming it.
      violations.push("preview must declare required and a non-empty human-readable effectSummary");
    } else if (preview.required !== true) {
      // `docs/planning/architecture.md`: "Normal updates require preview and confirmation."
      // Preview is not a severity escalation - it is the confirmation step for every
      // mutation. Risk decides whether recent reauthentication is *additionally* required.
      violations.push("every action must require preview; risk decides whether reauthentication is also required");
    }
  }
  if (value.idempotency !== undefined) {
    const idempotency = value.idempotency;
    if (!isRecord(idempotency) || !KEY_RULES.includes(idempotency.keyRule as string)
        || !Number.isInteger(idempotency.windowSeconds) || (idempotency.windowSeconds as number) <= 0) {
      violations.push("idempotency must declare a keyRule and a positive windowSeconds");
    }
  }
  if (value.concurrency !== undefined) {
    const concurrency = value.concurrency;
    if (!isRecord(concurrency) || typeof concurrency.optimisticToken !== "string" || !IDENTIFIER.test(concurrency.optimisticToken)) {
      violations.push("concurrency.optimisticToken must name a record field");
    }
  }
  if (value.maxBatchSize !== undefined
      && (!Number.isInteger(value.maxBatchSize) || (value.maxBatchSize as number) < 1 || (value.maxBatchSize as number) > MAX_BATCH)) {
    violations.push(`maxBatchSize must be an integer 1..${MAX_BATCH}`);
  } else if (Number.isInteger(value.maxBatchSize) && typeof value.risk === "string") {
    // Risk and batch size must agree. A batching action declared `normal` would escape the
    // recent-reauthentication requirement that bulk and high-impact actions carry, so the
    // label cannot contradict the capability.
    const batch = value.maxBatchSize as number;
    if (value.risk === "bulk" && batch <= 1) violations.push("a bulk action must declare maxBatchSize greater than 1");
    if (batch > 1 && value.risk !== "bulk" && value.risk !== "high-impact") {
      violations.push(`maxBatchSize ${batch} requires risk bulk or high-impact, not ${value.risk}`);
    }
  }
  if (value.timeoutMs !== undefined
      && (!Number.isInteger(value.timeoutMs) || (value.timeoutMs as number) < 1 || (value.timeoutMs as number) > MAX_TIMEOUT_MS)) {
    violations.push(`timeoutMs must be an integer 1..${MAX_TIMEOUT_MS}`);
  }
  if (value.retry !== undefined && (!isRecord(value.retry) || !RETRY.includes(value.retry.classification as string))) {
    violations.push(`retry.classification must be one of ${RETRY.join(", ")}`);
  }
  // The idempotency window must outlast the timeout. A client that retries after a timeout
  // would otherwise present its key outside the dedup window and commit the effect twice,
  // which is exactly what ACT-001's idempotency rule exists to prevent.
  if (isRecord(value.idempotency) && Number.isInteger(value.idempotency.windowSeconds)
      && Number.isInteger(value.timeoutMs)) {
    const windowMs = (value.idempotency.windowSeconds as number) * 1_000;
    if (windowMs < (value.timeoutMs as number)) {
      violations.push(`idempotency window (${windowMs}ms) must be at least the timeout (${String(value.timeoutMs)}ms)`);
    }
  }
  for (const section of ["audit", "redaction"] as const) {
    const entry = value[section];
    if (entry !== undefined && (!isRecord(entry) || !isStringArray(entry.fields))) {
      violations.push(`${section}.fields must be an array of strings`);
    }
  }

  if (violations.length > 0) fail("MALFORMED_MANIFEST", violations, requestId);
  return value as unknown as ActionDeclaration;
}
