export { CATALOG_CONTRACT_VERSION, type ContractVersion } from "./version.js";
export {
  COMPONENT_STATES,
  type AccessibilityContract, type Catalog, type ComponentCost, type ComponentRegistration,
  type ComponentState, type DataNeed, type JsonSchemaDocument, type SlotDeclaration
} from "./contracts.js";
export { CatalogError } from "./errors.js";
export { buildCatalog, validateRegistration } from "./validation.js";
