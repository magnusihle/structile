/** Atomic, typed rejection: all violations at once, nothing partially registered. */
export class CatalogError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(violations.join("; "));
    this.name = "CatalogError";
    this.violations = Object.freeze([...violations]);
  }
}
