export interface ContractVersion {
  readonly major: number;
  readonly minor: number;
}

export const CATALOG_CONTRACT_VERSION: ContractVersion = Object.freeze({ major: 1, minor: 0 });
