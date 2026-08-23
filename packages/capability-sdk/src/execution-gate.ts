import { CapabilityContractError } from "./errors.js";

/**
 * Action execution is specified at G1 and enabled at G4A, and only after the read-only
 * tenant-isolation gate has passed with protected evidence
 * (`docs/planning/decisions-and-assumptions.md` -> Actions).
 *
 * This constant is not a feature flag. There is no configuration, environment variable or
 * argument that flips it: the package contains no execution transport at all, so enabling
 * execution requires shipping new code through the gate rather than changing a setting.
 */
export const ACTION_EXECUTION_ENABLED = false as const;

/** Always throws. Present so callers fail loudly rather than silently no-op. */
export function assertExecutionDisabled(): never {
  throw new CapabilityContractError("EXECUTION_DISABLED", [
    "action execution is disabled until the upstream read-only isolation gate passes with protected evidence"
  ]);
}
