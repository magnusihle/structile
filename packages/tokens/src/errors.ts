/**
 * Rejection is atomic: every violation found is reported at once and nothing is
 * partially applied. Callers can rely on the error type, not on message parsing.
 */
export class TokenContractError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(violations.join("; "));
    this.name = "TokenContractError";
    this.violations = Object.freeze([...violations]);
  }
}
