/**
 * Stable machine error codes (CAP-004). These are contract surface: a project backend in
 * any language returns them, and the control plane branches on them. Never renumber or
 * repurpose a code; add new ones instead.
 */
export const CapabilityErrorCode = Object.freeze({
  UNSUPPORTED_CONTRACT_VERSION: "UNSUPPORTED_CONTRACT_VERSION",
  MALFORMED_MANIFEST: "MALFORMED_MANIFEST",
  UNSIGNED_MANIFEST: "UNSIGNED_MANIFEST",
  UNKNOWN_RESOURCE: "UNKNOWN_RESOURCE",
  UNKNOWN_FIELD: "UNKNOWN_FIELD",
  UNAUTHORIZED_CAPABILITY: "UNAUTHORIZED_CAPABILITY",
  UNDECLARED_RELATIONSHIP: "UNDECLARED_RELATIONSHIP",
  COST_LIMIT_EXCEEDED: "COST_LIMIT_EXCEEDED",
  INVALID_CURSOR: "INVALID_CURSOR",
  EXECUTION_DISABLED: "EXECUTION_DISABLED"
} as const);

export type CapabilityErrorCodeName = keyof typeof CapabilityErrorCode;

/** Atomic, typed rejection carrying a stable code and a correlatable request id. */
export class CapabilityContractError extends Error {
  readonly code: CapabilityErrorCodeName;
  readonly violations: readonly string[];
  readonly requestId: string | undefined;

  constructor(code: CapabilityErrorCodeName, violations: readonly string[], requestId?: string) {
    super(`${code}: ${violations.join("; ")}`);
    this.name = "CapabilityContractError";
    this.code = code;
    this.violations = Object.freeze([...violations]);
    this.requestId = requestId;
  }
}
