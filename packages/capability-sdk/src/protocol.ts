import { CapabilityContractError, CapabilityErrorCode } from "./errors.js";

export interface ContractVersion {
  readonly major: number;
  readonly minor: number;
}

export const CAPABILITY_PROTOCOL_VERSION: ContractVersion = Object.freeze({ major: 1, minor: 0 });

export const SUPPORTED_PROTOCOL_VERSIONS: readonly ContractVersion[] =
  Object.freeze([Object.freeze({ major: 1, minor: 0 })]);

/** The audience a principal token must name for this control plane. */
export const PRINCIPAL_AUDIENCE = "structile-control-plane";

/**
 * Pick the highest mutually supported major, or fail closed. There is deliberately no
 * "best effort" branch: an unrecognised protocol version means the two sides disagree
 * about what the bytes mean, which is not a condition to guess through.
 */
export function negotiateProtocolVersion(offered: unknown): ContractVersion {
  if (!Array.isArray(offered) || offered.length === 0) {
    throw new CapabilityContractError(CapabilityErrorCode.UNSUPPORTED_CONTRACT_VERSION,
      ["no contract versions offered"]);
  }
  const supported = SUPPORTED_PROTOCOL_VERSIONS.map((version) => version.major);
  const majors = offered
    .filter((item): item is ContractVersion =>
      typeof item === "object" && item !== null && Number.isInteger((item as ContractVersion).major))
    .map((item) => item.major)
    .filter((major) => supported.includes(major))
    .sort((a, b) => b - a);
  const chosen = majors[0];
  if (chosen === undefined) {
    throw new CapabilityContractError(CapabilityErrorCode.UNSUPPORTED_CONTRACT_VERSION,
      [`no mutually supported major; this runtime supports ${supported.join(", ")}`]);
  }
  return Object.freeze({ major: chosen, minor: CAPABILITY_PROTOCOL_VERSION.minor });
}
