import type { ContractVersion } from "./protocol.js";

export interface ResourceDeclaration {
  readonly name: string;
  readonly fields: readonly string[];
}

export interface RelationshipDeclaration {
  readonly name: string;
  readonly from: string;
  readonly to: string;
}

/**
 * The maximum surface a project backend exposes. Tenant administrators may mask entries;
 * nothing outside this manifest is reachable, and joins exist only where declared here.
 */
export interface CapabilityManifest {
  readonly contractVersion: ContractVersion;
  readonly resources: readonly ResourceDeclaration[];
  readonly fields: readonly string[];
  readonly metrics: readonly string[];
  readonly filters: readonly string[];
  readonly relationships: readonly RelationshipDeclaration[];
  readonly queries: readonly string[];
  readonly exports: readonly string[];
  readonly actions: readonly string[];
  readonly signature: string;
}

export type ActionRisk = "normal" | "destructive" | "bulk" | "high-impact";
export type ActionMode = "sync" | "async";
export type RetryClassification = "retryable" | "non-retryable";

/** Scope kinds an action may target. Records only: never code, SQL, network or infra. */
export type ActionScopeKind = "resource" | "record";

export interface ActionScope {
  readonly kind: ActionScopeKind;
  readonly value: string;
}

export interface JsonSchemaDocument {
  readonly type: "object";
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
}

/** ACT-001: everything an action must declare before execution is even considered. */
export interface ActionDeclaration {
  readonly id: string;
  readonly version: ContractVersion;
  readonly input: JsonSchemaDocument;
  readonly output: JsonSchemaDocument;
  readonly permissions: readonly string[];
  readonly scope: readonly ActionScope[];
  readonly risk: ActionRisk;
  readonly preview: { readonly required: boolean; readonly effectSummary: string };
  readonly idempotency: { readonly keyRule: "client-supplied" | "derived"; readonly windowSeconds: number };
  readonly concurrency: { readonly optimisticToken: string };
  readonly maxBatchSize: number;
  readonly mode: ActionMode;
  readonly timeoutMs: number;
  readonly retry: { readonly classification: RetryClassification };
  readonly audit: { readonly fields: readonly string[] };
  readonly redaction: { readonly fields: readonly string[] };
}
