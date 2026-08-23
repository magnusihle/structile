import type { ContractVersion, TokenId } from "./contract.js";

export type ThemeMode = "light" | "dark";

/**
 * Override scopes, narrowest last.
 * - `product`: the product owns its palette and may set any token.
 * - `tenant`: a tenant administrator may set only `tenantOverridableTokens`.
 * - `user`: a user chooses light or dark and nothing else.
 */
export type ThemeScope = "product" | "tenant" | "user";

export const THEME_SCOPES: readonly ThemeScope[] = Object.freeze(["product", "tenant", "user"] as const);

export type TokenValue = string;

export interface Theme {
  readonly version: ContractVersion;
  readonly mode: ThemeMode;
  readonly tokens: Readonly<Record<TokenId, TokenValue>>;
}

export interface ThemeOverride {
  readonly scope: ThemeScope;
  readonly tokens: Readonly<Partial<Record<TokenId, TokenValue>>>;
  /** Only meaningful for the `user` scope, which may select a mode and nothing else. */
  readonly mode?: ThemeMode;
}

/** Text size class, which decides the contrast ratio the pair must clear. */
export type ContrastLevel = "body" | "large" | "ui";

export interface ContrastRequirement {
  readonly foreground: TokenId;
  readonly background: TokenId;
  readonly level: ContrastLevel;
}
