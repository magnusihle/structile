export interface ContractVersion {
  readonly major: number;
  readonly minor: number;
}

export const SPEC_SCHEMA_VERSION: ContractVersion = Object.freeze({ major: 1, minor: 0 });

/**
 * Majors this runtime can read. SPEC-002 requires current and previous; only major 1
 * exists so far, so `previous` is null and the migration set is empty. The surface is
 * declared now so N/N-1 support is a matter of adding a migration, not a redesign.
 */
export const SUPPORTED_SPEC_MAJORS: readonly number[] = Object.freeze([1]);

export interface CompatibilityMatrix {
  readonly current: number;
  readonly previous: number | null;
  readonly supported: readonly number[];
  readonly migrations: readonly { readonly from: number; readonly to: number }[];
  readonly rollback: "supported" | "not-yet-applicable";
}

export function compatibilityMatrix(): CompatibilityMatrix {
  const sorted = [...SUPPORTED_SPEC_MAJORS].sort((a, b) => b - a);
  const current = sorted[0] as number;
  const previous = sorted.length > 1 ? (sorted[1] as number) : null;
  return Object.freeze({
    current,
    previous,
    supported: Object.freeze([...sorted]),
    migrations: Object.freeze([]),
    rollback: previous === null ? "not-yet-applicable" : "supported"
  });
}
