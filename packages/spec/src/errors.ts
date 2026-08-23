/**
 * Rejection is atomic and typed. A caller must be able to tell a validation failure from
 * a crash, so every internal fault is surfaced as a SpecificationError, never as a raw
 * TypeError escaping from JSON handling.
 */
export class SpecificationError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(violations.join("; "));
    this.name = "SpecificationError";
    this.violations = Object.freeze([...violations]);
  }
}
