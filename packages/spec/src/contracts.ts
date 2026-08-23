import type { ContractVersion } from "./version.js";

/** A single component instance in the tree. Data only: an ID, validated props, slots. */
export interface SpecificationNode {
  readonly componentId: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly slots: Readonly<Record<string, readonly SpecificationNode[]>>;
  /** Optional reference to an authorised query declared elsewhere. Never inline SQL. */
  readonly queryRef?: string;
  /** Optional reference to a declared action. Referencing is not executing. */
  readonly actionRef?: string;
}

export interface PageSpecification {
  readonly id: string;
  readonly path: string;
  readonly titleKey?: string;
  readonly nodes: readonly SpecificationNode[];
}

export interface ApplicationSpecification {
  readonly specVersion: ContractVersion;
  readonly id: string;
  readonly title: string;
  readonly pages: readonly PageSpecification[];
  readonly themeRef?: string;
}
