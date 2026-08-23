import { TokenContractError } from "./errors.js";

/**
 * Semantic design-token contract (DS-001).
 *
 * The taxonomy is closed: a token identifier that is not listed here is rejected.
 * Products theme Structile by supplying values for these identifiers, never by
 * inventing new ones, so every registered component can rely on the same surface.
 */

export interface ContractVersion {
  readonly major: number;
  readonly minor: number;
}

export const TOKENS_CONTRACT_VERSION: ContractVersion = Object.freeze({ major: 1, minor: 0 });

/**
 * Token-contract majors this code can read. A theme is versioned data: a newer major
 * means the taxonomy changed, so reading it with these token IDs would silently produce
 * a half-themed interface. Fail closed instead, as `@structile/spec` does for specs.
 */
export const SUPPORTED_TOKEN_MAJORS: readonly number[] = Object.freeze([1]);

/** The six categories named by DS-001. Order is stable and part of the contract. */
export const TOKEN_CATEGORIES = Object.freeze([
  "color", "typography", "spacing", "elevation", "motion", "density"
] as const);

export type TokenCategory = (typeof TOKEN_CATEGORIES)[number];

const COLOR_TOKENS = [
  "color.surface.default", "color.surface.raised", "color.surface.sunken", "color.surface.overlay",
  "color.text.primary", "color.text.secondary", "color.text.disabled", "color.text.inverse",
  "color.border.default", "color.border.subtle", "color.border.strong",
  "color.accent.default", "color.accent.hover", "color.accent.contrast",
  "color.status.success", "color.status.warning", "color.status.danger", "color.status.info",
  "color.brand.logo"
] as const;

const TYPOGRAPHY_TOKENS = [
  "typography.family.sans", "typography.family.mono",
  "typography.heading.size", "typography.heading.lineHeight", "typography.heading.weight",
  "typography.body.size", "typography.body.lineHeight", "typography.body.weight",
  "typography.caption.size", "typography.caption.lineHeight", "typography.caption.weight"
] as const;

const SPACING_TOKENS = [
  "spacing.050", "spacing.100", "spacing.200", "spacing.300",
  "spacing.400", "spacing.600", "spacing.800"
] as const;

const ELEVATION_TOKENS = [
  "elevation.000", "elevation.100", "elevation.200", "elevation.300"
] as const;

const MOTION_TOKENS = [
  "motion.instant", "motion.fast", "motion.moderate", "motion.slow", "motion.easing.standard"
] as const;

const DENSITY_TOKENS = [
  "density.compact", "density.comfortable", "density.spacious"
] as const;

export const TOKEN_IDS = Object.freeze([
  ...COLOR_TOKENS, ...TYPOGRAPHY_TOKENS, ...SPACING_TOKENS,
  ...ELEVATION_TOKENS, ...MOTION_TOKENS, ...DENSITY_TOKENS
] as const);

export type TokenId = (typeof TOKEN_IDS)[number];

const TOKEN_ID_SET: ReadonlySet<string> = new Set<string>(TOKEN_IDS);

export function isTokenId(value: string): value is TokenId {
  return TOKEN_ID_SET.has(value);
}

export function tokenCategory(id: TokenId): TokenCategory {
  if (typeof id !== "string" || !TOKEN_ID_SET.has(id)) {
    throw new TokenContractError([`unknown token ${String(id)}`]);
  }
  return id.slice(0, id.indexOf(".")) as TokenCategory;
}

/**
 * Only these tokens may be overridden by a tenant administrator. The rest are the
 * product's decision (`docs/planning/decisions-and-assumptions.md` -> Branding:
 * "product tokens, limited tenant logo/accent overrides, user light/dark mode").
 */
export const tenantOverridableTokens: readonly TokenId[] = Object.freeze([
  "color.accent.default", "color.accent.hover", "color.accent.contrast", "color.brand.logo"
] as const);
