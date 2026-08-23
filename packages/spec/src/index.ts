export {
  SPEC_SCHEMA_VERSION, SUPPORTED_SPEC_MAJORS, compatibilityMatrix,
  type CompatibilityMatrix, type ContractVersion
} from "./version.js";
export { LIMITS, type Limits } from "./limits.js";
export type { ApplicationSpecification, PageSpecification, SpecificationNode } from "./contracts.js";
export { SpecificationError } from "./errors.js";
export { negotiateSpecVersion, validateSpecification, type ValidateOptions } from "./validation.js";
