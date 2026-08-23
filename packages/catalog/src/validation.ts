import { COMPONENT_STATES, type Catalog, type ComponentRegistration, type ComponentState,
         type JsonSchemaDocument } from "./contracts.js";
import { CatalogError } from "./errors.js";

/** Stable, dotted, lowercase. IDs are referenced by stored specifications forever. */
const COMPONENT_ID = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;
const SLOT_NAME = /^[a-z][a-zA-Z0-9]*$/;
const PERMISSION = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;
const FIELD_NAME = /^[a-z][a-zA-Z0-9_]*$/;
const STATES: ReadonlySet<string> = new Set<string>(COMPONENT_STATES);

const MAX_SLOTS = 16;
const MAX_SLOT_CHILDREN = 256;
const MAX_STATIC_WEIGHT = 100;
const MAX_ROWS = 10_000;

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

function validateProps(value: unknown, violations: string[]): void {
  if (!isRecord(value)) { violations.push("props must be a JSON Schema object"); return; }
  if (value.type !== "object") violations.push("props.type must be \"object\"");
  if (value.additionalProperties !== false) violations.push("props.additionalProperties must be false");
  if (!isRecord(value.properties)) { violations.push("props.properties must be an object"); return; }
  for (const [name, schema] of Object.entries(value.properties)) {
    if (!FIELD_NAME.test(name)) violations.push(`props.${name}: invalid prop name`);
    if (!isRecord(schema) || typeof schema.type !== "string") violations.push(`props.${name}: must declare a type`);
  }
  if (value.required !== undefined) {
    if (!isStringArray(value.required)) violations.push("props.required must be an array of strings");
    else for (const name of value.required) {
      if (!Object.hasOwn(value.properties as object, name)) violations.push(`props.required lists unknown prop ${name}`);
    }
  }
}

const REGISTRATION_KEYS: readonly string[] = Object.freeze([
  "id", "version", "props", "slots", "states", "accessibility", "dataNeeds", "permissions", "cost"
]);

/** Validate one registration against every DS-003 obligation. */
export function validateRegistration(value: unknown): ComponentRegistration {
  if (!isRecord(value)) throw new CatalogError(["registration must be an object"]);
  const violations: string[] = [];

  // The published schema sets additionalProperties:false; the validator must agree, or a
  // schema-driven implementation in another language rejects what this one accepts.
  for (const key of Object.keys(value)) {
    if (!REGISTRATION_KEYS.includes(key)) violations.push(`unknown property ${key}`);
  }
  for (const field of REGISTRATION_KEYS) {
    if (value[field] === undefined) violations.push(`missing ${field}`);
  }

  if (value.id !== undefined && (typeof value.id !== "string" || !COMPONENT_ID.test(value.id))) {
    violations.push("id must be stable dotted lowercase, e.g. core.kpi");
  }
  if (value.version !== undefined) {
    const version = value.version;
    if (!isRecord(version) || !Number.isInteger(version.major) || !Number.isInteger(version.minor)
        || (version.major as number) < 1 || (version.minor as number) < 0) {
      violations.push("version must declare a positive integer major and a non-negative integer minor");
    }
  }
  if (value.props !== undefined) validateProps(value.props, violations);

  if (value.slots !== undefined) {
    if (!Array.isArray(value.slots)) violations.push("slots must be an array");
    else {
      if (value.slots.length > MAX_SLOTS) violations.push(`slots must not exceed ${MAX_SLOTS}`);
      for (const slot of value.slots) {
        if (!isRecord(slot)) { violations.push("slot must be an object"); continue; }
        if (typeof slot.name !== "string" || !SLOT_NAME.test(slot.name)) violations.push(`slot ${String(slot.name)}: invalid name`);
        if (!Number.isInteger(slot.maxChildren) || (slot.maxChildren as number) < 0 || (slot.maxChildren as number) > MAX_SLOT_CHILDREN) {
          violations.push(`slot ${String(slot.name)}: maxChildren must be 0..${MAX_SLOT_CHILDREN}`);
        }
        if (slot.accepts !== undefined && !isStringArray(slot.accepts)) violations.push(`slot ${String(slot.name)}: accepts must be string ids`);
      }
    }
  }

  if (value.states !== undefined) {
    if (!Array.isArray(value.states)) violations.push("states must be an array");
    else {
      const seenStates = new Set<string>();
      for (const state of value.states) {
        if (typeof state !== "string" || !STATES.has(state)) { violations.push(`unknown state ${String(state)}`); continue; }
        if (seenStates.has(state)) violations.push(`duplicate state ${state}`);
        seenStates.add(state);
      }
      for (const required of ["loading", "error", "ready"] satisfies ComponentState[]) {
        if (!value.states.includes(required)) violations.push(`states must include ${required}`);
      }
    }
  }

  if (value.accessibility !== undefined) {
    const a11y = value.accessibility;
    if (!isRecord(a11y)) violations.push("accessibility must be an object");
    else {
      for (const field of ["role", "keyboard", "labelledBy"]) {
        if (typeof a11y[field] !== "string" || (a11y[field] as string).length === 0) violations.push(`accessibility.${field} is required`);
      }
      if (a11y.focusOrder !== "dom" && a11y.focusOrder !== "managed") violations.push("accessibility.focusOrder must be dom or managed");
    }
  }

  if (value.dataNeeds !== undefined) {
    if (!Array.isArray(value.dataNeeds)) violations.push("dataNeeds must be an array");
    else for (const need of value.dataNeeds) {
      if (!isRecord(need)) { violations.push("dataNeed must be an object"); continue; }
      if (typeof need.resource !== "string" || need.resource.length === 0) violations.push("dataNeed.resource is required");
      if (!isStringArray(need.fields)) violations.push("dataNeed.fields must be an array of strings");
      else for (const field of need.fields) if (!FIELD_NAME.test(field)) violations.push(`dataNeed field ${field} is not a plain field name`);
    }
  }

  if (value.permissions !== undefined) {
    if (!isStringArray(value.permissions)) violations.push("permissions must be an array of strings");
    else for (const permission of value.permissions) {
      if (!PERMISSION.test(permission)) violations.push(`permission ${permission} must be dotted lowercase`);
    }
  }

  if (value.cost !== undefined) {
    const cost = value.cost;
    if (!isRecord(cost)) violations.push("cost must be an object");
    else {
      if (typeof cost.staticWeight !== "number" || !Number.isFinite(cost.staticWeight) || cost.staticWeight < 0 || cost.staticWeight > MAX_STATIC_WEIGHT) {
        violations.push(`cost.staticWeight must be a number 0..${MAX_STATIC_WEIGHT}`);
      }
      if (!Number.isInteger(cost.maxRows) || (cost.maxRows as number) < 0 || (cost.maxRows as number) > MAX_ROWS) {
        violations.push(`cost.maxRows must be an integer 0..${MAX_ROWS}`);
      }
    }
  }

  if (violations.length > 0) throw new CatalogError(violations);
  return value as unknown as ComponentRegistration;
}

/** Build a catalog document. Component IDs must be unique: specs reference them by ID. */
export function buildCatalog(registrations: readonly unknown[]): Catalog {
  const violations: string[] = [];
  const seen = new Set<string>();
  const components: ComponentRegistration[] = [];
  for (const [index, candidate] of registrations.entries()) {
    try {
      const registration = validateRegistration(candidate);
      if (seen.has(registration.id)) violations.push(`duplicate component id ${registration.id}`);
      seen.add(registration.id);
      components.push(registration);
    } catch (error) {
      const failure = error as CatalogError;
      violations.push(...(failure.violations ?? [String(failure.message)]).map((v) => `[${index}] ${v}`));
    }
  }
  if (violations.length > 0) throw new CatalogError(violations);
  return { schemaVersion: "1.0.0", components: Object.freeze(components) };
}
