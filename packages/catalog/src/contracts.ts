import type { ContractVersion } from "./version.js";

/** A JSON Schema document describing a component's props. Data only. */
export interface JsonSchemaDocument {
  readonly type: "object";
  readonly additionalProperties: false;
  readonly properties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly required?: readonly string[];
}

export interface SlotDeclaration {
  readonly name: string;
  readonly maxChildren: number;
  /** Component IDs permitted in this slot; empty means any registered component. */
  readonly accepts?: readonly string[];
}

/** Every renderable state a component must be able to express (DS-003). */
export const COMPONENT_STATES = Object.freeze(["loading", "empty", "forbidden", "error", "ready"] as const);
export type ComponentState = (typeof COMPONENT_STATES)[number];

export interface AccessibilityContract {
  readonly role: string;
  readonly keyboard: string;
  readonly focusOrder: "dom" | "managed";
  readonly labelledBy: string;
}

/** A field the component needs from a capability resource. Never SQL, never a join. */
export interface DataNeed {
  readonly resource: string;
  readonly fields: readonly string[];
}

export interface ComponentCost {
  /** Static weight used by the specification cost model. */
  readonly staticWeight: number;
  readonly maxRows: number;
}

/** DS-003: the nine facts every renderable component must register. */
export interface ComponentRegistration {
  readonly id: string;
  readonly version: ContractVersion;
  readonly props: JsonSchemaDocument;
  readonly slots: readonly SlotDeclaration[];
  readonly states: readonly ComponentState[];
  readonly accessibility: AccessibilityContract;
  readonly dataNeeds: readonly DataNeed[];
  readonly permissions: readonly string[];
  readonly cost: ComponentCost;
}

export interface Catalog {
  readonly schemaVersion: "1.0.0";
  readonly components: readonly ComponentRegistration[];
}
