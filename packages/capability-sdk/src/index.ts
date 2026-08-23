export {
  CAPABILITY_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, PRINCIPAL_AUDIENCE,
  negotiateProtocolVersion, type ContractVersion
} from "./protocol.js";
export {
  type ActionDeclaration, type ActionMode, type ActionRisk, type ActionScope,
  type ActionScopeKind, type CapabilityManifest, type JsonSchemaDocument,
  type RelationshipDeclaration, type ResourceDeclaration, type RetryClassification
} from "./contracts.js";
export { CapabilityContractError, CapabilityErrorCode, type CapabilityErrorCodeName } from "./errors.js";
export { MANIFEST_KEYS, validateActionDeclaration, validateCapabilityManifest } from "./validation.js";
export { ACTION_EXECUTION_ENABLED, assertExecutionDisabled } from "./execution-gate.js";
