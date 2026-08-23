import { TOKEN_IDS, isTokenId, tenantOverridableTokens, tokenCategory,
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
  typography: /^(?:[A-Za-z][A-Za-z0-9 -]*(?:,\s*[A-Za-z][A-Za-z0-9 -]*)*|\d+(?:\.\d+)?(?:px|rem)?|[1-9]00)$/,
  spacing: /^\d+(?:\.\d+)?(?:px|rem)$/,
  elevation: null,
  motion: /^(?:\d+ms|cubic-bezier\([\d.,\s]+\))$/,
  density: /^\d+(?:\.\d+)?$/
});

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
  const grammar = CATEGORY_GRAMMAR[tokenCategory(id)];
  if (grammar !== null && !grammar.test(value)) {
    violations.push(`${id}: value does not match the ${tokenCategory(id)} grammar`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate a complete theme. Every contract token must be present exactly once. */
export function validateTheme(value: unknown): Theme {
  const violations: string[] = [];
  if (!isRecord(value)) throw new TokenContractError(["theme must be an object"]);

  const mode = value.mode;
  if (typeof mode !== "string" || !MODES.includes(mode as ThemeMode)) {
    violations.push(`mode must be one of ${MODES.join(", ")}`);
  }
  const version = value.version;
  if (!isRecord(version) || typeof version.major !== "number" || typeof version.minor !== "number") {
    violations.push("version must declare numeric major and minor");
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
  return value as unknown as Theme;
}

/** Validate a scoped override. Scope decides which tokens may be touched at all. */
export function validateThemeOverride(value: unknown): ThemeOverride {
  const violations: string[] = [];
  if (!isRecord(value)) throw new TokenContractError(["override must be an object"]);

  const scope = value.scope;
  if (typeof scope !== "string" || !THEME_SCOPES.includes(scope as ThemeScope)) {
    throw new TokenContractError([`scope must be one of ${THEME_SCOPES.join(", ")}`]);
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
  return value as unknown as ThemeOverride;
}
