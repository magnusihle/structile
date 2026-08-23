import { SUPPORTED_TOKEN_MAJORS, TOKEN_IDS, isTokenId, tenantOverridableTokens, tokenCategory,
         type TokenCategory, type TokenId } from "./contract.js";
import { TokenContractError } from "./errors.js";
import { THEME_SCOPES, type Theme, type ThemeMode, type ThemeOverride, type ThemeScope } from "./theme.js";

const MODES: readonly ThemeMode[] = Object.freeze(["light", "dark"] as const);

/**
 * Values that may never appear in a token, whatever the category. A specification or
 * theme is untrusted data; a token value is interpolated into a stylesheet, so a value
 * that can escape its declaration is a styling-layer injection.
 *
 * This runs before the per-category grammar so that categories with deliberately
 * free-form values (elevation shadows) are still covered.
 */
const FORBIDDEN_VALUE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = Object.freeze([
  ["url-function", /url\s*\(/i],
  ["css-expression", /expression\s*\(/i],
  ["javascript-scheme", /javascript\s*:/i],
  ["data-scheme", /data\s*:/i],
  ["css-import", /@import/i],
  ["css-important", /!important/i],
  ["markup", /<\/?[a-z]/i],
  ["css-block", /[{}]/],
  ["escape", /\\/],
  ["event-handler", /\bon[a-z]+\s*=/i],
  ["semicolon", /;/]
] as const);

const MAX_VALUE_LENGTH = 200;

/**
 * Per-category value grammars. `elevation` is intentionally free-form: CSS shadows have
 * no compact grammar worth encoding, and keeping one permissive category means the
 * forbidden-value scan above is load-bearing rather than shadowed by a stricter regex.
 */
const CATEGORY_GRAMMAR: Readonly<Record<TokenCategory, RegExp | null>> = Object.freeze({
  color: /^#[0-9a-f]{6}$/i,
  typography: null,
  spacing: /^\d+(?:\.\d+)?(?:px|rem)$/,
  elevation: null,
  motion: /^(?:\d+ms|cubic-bezier\([\d.,\s]+\))$/,
  density: /^\d+(?:\.\d+)?$/
});

/**
 * Typography values differ by role, so a single per-category grammar would accept a font
 * name where a size belongs. Roles are matched before the category fallback.
 */
const ROLE_GRAMMAR: ReadonlyArray<readonly [RegExp, RegExp, string]> = Object.freeze([
  [/^typography\.family\./, /^[A-Za-z][A-Za-z0-9 -]*(?:,\s*[A-Za-z][A-Za-z0-9 -]*)*$/, "font stack"],
  [/^typography\..*\.size$/, /^\d+(?:\.\d+)?(?:px|rem)$/, "length"],
  [/^typography\..*\.lineHeight$/, /^(?:\d+(?:\.\d+)?(?:px|rem)|\d+(?:\.\d+)?)$/, "length or unitless ratio"],
  [/^typography\..*\.weight$/, /^[1-9]00$/, "100..900 in hundreds"]
] as const);

/** Upper bounds on numeric token values. A valid grammar is not the same as a sane value. */
const NUMERIC_BOUNDS: ReadonlyArray<readonly [RegExp, number, number, string]> = Object.freeze([
  [/^spacing\./, 0, 256, "px"],
  [/^typography\..*\.size$/, 8, 128, "px"],
  [/^typography\..*\.lineHeight$/, 0, 128, "px or ratio"],
  [/^motion\.(?!easing)/, 0, 5_000, "ms"],
  [/^density\./, 0.25, 4, "multiplier"]
] as const);

const BEZIER = /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/;

function checkBounds(id: string, value: string, violations: string[]): void {
  if (id.startsWith("motion.easing.")) {
    const bezier = BEZIER.exec(value);
    if (!bezier) { violations.push(`${id}: easing must be cubic-bezier with exactly four numbers`); return; }
    for (const index of [1, 3]) {
      const control = Number(bezier[index]);
      if (control < 0 || control > 1) violations.push(`${id}: bezier control point ${String(index)} must be within 0..1`);
    }
    return;
  }
  for (const [selector, minimum, maximum, unit] of NUMERIC_BOUNDS) {
    if (!selector.test(id)) continue;
    const magnitude = Number.parseFloat(value);
    if (!Number.isFinite(magnitude)) { violations.push(`${id}: value must be numeric`); return; }
    const normalised = value.endsWith("rem") ? magnitude * 16 : magnitude;
    if (normalised < minimum || normalised > maximum) {
      violations.push(`${id}: ${value} is outside the supported range ${minimum}..${maximum} ${unit}`);
    }
    return;
  }
}

function scanValue(id: string, value: unknown, violations: string[]): void {
  if (typeof value !== "string") {
    violations.push(`${id}: value must be a string, received ${typeof value}`);
    return;
  }
  if (value.length === 0 || value.length > MAX_VALUE_LENGTH) {
    violations.push(`${id}: value must be 1..${MAX_VALUE_LENGTH} characters`);
    return;
  }
  for (const [name, pattern] of FORBIDDEN_VALUE_PATTERNS) {
    if (pattern.test(value)) {
      violations.push(`${id}: forbidden style value (${name})`);
      return;
    }
  }
  if (!isTokenId(id)) return;
  for (const [selector, grammar, label] of ROLE_GRAMMAR) {
    if (selector.test(id)) {
      if (!grammar.test(value)) violations.push(`${id}: value must be a ${label}`);
      else checkBounds(id, value, violations);
      return;
    }
  }
  const grammar = CATEGORY_GRAMMAR[tokenCategory(id)];
  if (grammar !== null && !grammar.test(value)) {
    violations.push(`${id}: value does not match the ${tokenCategory(id)} grammar`);
    return;
  }
  checkBounds(id, value, violations);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate a complete theme. Every contract token must be present exactly once. */
const THEME_KEYS: readonly string[] = Object.freeze(["version", "mode", "tokens"]);
const OVERRIDE_KEYS: readonly string[] = Object.freeze(["scope", "mode", "tokens"]);

/** The published schemas set additionalProperties:false; the validator must agree. */
function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], violations: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) violations.push(`unknown property ${key}`);
  }
}

export function validateTheme(value: unknown): Theme {
  const violations: string[] = [];
  if (!isRecord(value)) throw new TokenContractError(["theme must be an object"]);
  rejectUnknownKeys(value, THEME_KEYS, violations);

  const mode = value.mode;
  if (typeof mode !== "string" || !MODES.includes(mode as ThemeMode)) {
    violations.push(`mode must be one of ${MODES.join(", ")}`);
  }
  const version = value.version;
  if (!isRecord(version) || !Number.isInteger(version.major) || !Number.isInteger(version.minor)
      || (version.major as number) < 1 || (version.minor as number) < 0) {
    violations.push("version must declare a positive integer major and a non-negative integer minor");
  } else if (!SUPPORTED_TOKEN_MAJORS.includes(version.major as number)) {
    violations.push(
      `unsupported token-contract major ${String(version.major)}; supported: ${SUPPORTED_TOKEN_MAJORS.join(", ")}`);
  }

  const tokens = value.tokens;
  if (!isRecord(tokens)) {
    violations.push("tokens must be an object");
  } else {
    for (const [id, tokenValue] of Object.entries(tokens)) {
      if (!isTokenId(id)) { violations.push(`${id}: unknown token`); continue; }
      scanValue(id, tokenValue, violations);
    }
    // A theme is complete by definition: a component may reference any contract token,
    // so a partially populated theme would fail at render time instead of validation time.
    const declared = new Set(Object.keys(tokens));
    const missing = TOKEN_IDS.filter((id) => !declared.has(id));
    if (missing.length > 0) violations.push(`theme is missing ${missing.length} token(s): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", ..." : ""}`);
  }

  if (violations.length > 0) throw new TokenContractError(violations);
  // Detached and frozen: a validated theme must not alias the untrusted input, which a
  // caller could still hold and mutate after validation.
  return Object.freeze({
    version: Object.freeze({ ...(value.version as Record<string, number>) }),
    mode: value.mode as ThemeMode,
    tokens: Object.freeze({ ...(value.tokens as Record<string, string>) })
  }) as unknown as Theme;
}

/** Validate a scoped override. Scope decides which tokens may be touched at all. */
export function validateThemeOverride(value: unknown): ThemeOverride {
  const violations: string[] = [];
  if (!isRecord(value)) throw new TokenContractError(["override must be an object"]);

  rejectUnknownKeys(value, OVERRIDE_KEYS, violations);
  const scope = value.scope;
  if (typeof scope !== "string" || !THEME_SCOPES.includes(scope as ThemeScope)) {
    throw new TokenContractError([`scope must be one of ${THEME_SCOPES.join(", ")}`, ...violations]);
  }

  if (value.mode !== undefined) {
    if (scope !== "user") violations.push(`${scope} scope may not set mode`);
    else if (!MODES.includes(value.mode as ThemeMode)) violations.push(`mode must be one of ${MODES.join(", ")}`);
  }

  const tokens = value.tokens;
  if (tokens !== undefined && !isRecord(tokens)) {
    violations.push("tokens must be an object");
  } else if (isRecord(tokens)) {
    for (const [id, tokenValue] of Object.entries(tokens)) {
      if (!isTokenId(id)) { violations.push(`${id}: unknown token`); continue; }
      if (scope === "user") {
        violations.push(`${id}: user scope may only select light or dark mode`);
        continue;
      }
      if (scope === "tenant" && !tenantOverridableTokens.includes(id as TokenId)) {
        violations.push(`${id}: not tenant-overridable`);
        continue;
      }
      scanValue(id, tokenValue, violations);
    }
  }

  if (violations.length > 0) throw new TokenContractError(violations);
  const detached: Record<string, unknown> = { scope, tokens: Object.freeze({ ...(isRecord(tokens) ? tokens : {}) }) };
  if (value.mode !== undefined) detached.mode = value.mode;
  return Object.freeze(detached) as unknown as ThemeOverride;
}
