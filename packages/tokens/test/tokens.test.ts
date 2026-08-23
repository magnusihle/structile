import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  TOKENS_CONTRACT_VERSION, TOKEN_CATEGORIES, TOKEN_IDS, contrastRatio, contrastRequirements,
  defaultDarkTheme, defaultLightTheme, isTokenId, tenantOverridableTokens, tokenCategory,
  TokenContractError, validateTheme, validateThemeOverride, type Theme, type TokenId
} from "../dist/index.js";

const root = resolve(import.meta.dirname, "..");
const MINIMUM: Record<string, number> = { body: 4.5, large: 3, ui: 3 };
const themes: readonly Theme[] = [defaultLightTheme, defaultDarkTheme];

function withToken(theme: Theme, id: TokenId, value: string): unknown {
  return { ...theme, tokens: { ...theme.tokens, [id]: value } };
}

test("the taxonomy is closed and covers the six DS-001 categories", () => {
  assert.deepEqual([...TOKEN_CATEGORIES], ["color", "typography", "spacing", "elevation", "motion", "density"]);
  assert.equal(new Set(TOKEN_IDS).size, TOKEN_IDS.length, "token ids must be unique");
  for (const category of TOKEN_CATEGORIES) {
    assert.ok(TOKEN_IDS.some((id) => tokenCategory(id) === category), `${category} has no tokens`);
  }
  assert.equal(isTokenId("color.not.registered"), false);
  assert.equal(TOKENS_CONTRACT_VERSION.major, 1);
});

test("both default themes validate and define every contract token", () => {
  for (const theme of themes) {
    validateTheme(theme);
    assert.deepEqual(Object.keys(theme.tokens).sort(), [...TOKEN_IDS].sort(), `${theme.mode} is incomplete`);
  }
  assert.deepEqual(themes.map((theme) => theme.mode), ["light", "dark"]);
});

test("an incomplete theme is rejected", () => {
  const partial = { ...defaultLightTheme, tokens: { "color.text.primary": "#000000" } };
  assert.throws(() => validateTheme(partial), TokenContractError);
});

test("forbidden style values are rejected in a free-form category", () => {
  // elevation has no grammar, so only the forbidden-value scan can catch these.
  for (const payload of [
    "url(x)", "expression(1)", "javascript:x", "data:text/css,x", "@import x",
    "0 1px 2px #000 !important", "<b>", "a{b}", "a\\65 b", "onload=x", "a; b"
  ]) {
    assert.throws(() => validateTheme(withToken(defaultLightTheme, "elevation.100", payload)),
      TokenContractError, `elevation.100 accepted ${payload}`);
  }
  validateTheme(withToken(defaultLightTheme, "elevation.100", "0 1px 2px rgba(0, 0, 0, 0.2)"));
});

test("colour tokens must be sRGB hex", () => {
  for (const bad of ["red", "rgb(0,0,0)", "#fff", "oklch(0.5 0.1 200)", "#GGGGGG"]) {
    assert.throws(() => validateTheme(withToken(defaultLightTheme, "color.accent.default", bad)), TokenContractError);
  }
  validateTheme(withToken(defaultLightTheme, "color.accent.default", "#123456"));
});

test("unknown tokens and malformed envelopes are rejected", () => {
  assert.throws(() => validateTheme({ ...defaultLightTheme, tokens: { ...defaultLightTheme.tokens, "color.nope": "#000000" } }), TokenContractError);
  assert.throws(() => validateTheme({ ...defaultLightTheme, mode: "sepia" }), TokenContractError);
  assert.throws(() => validateTheme("light"), TokenContractError);
});

test("tenant scope may override only accent and logo tokens", () => {
  for (const id of tenantOverridableTokens) {
    validateThemeOverride({ scope: "tenant", tokens: { [id]: "#123456" } });
  }
  const denied = TOKEN_IDS.filter((id) => !tenantOverridableTokens.includes(id));
  assert.ok(denied.length > 0);
  for (const id of denied) {
    assert.throws(() => validateThemeOverride({ scope: "tenant", tokens: { [id]: "#123456" } }),
      TokenContractError, `tenant was allowed to override ${id}`);
  }
});

test("user scope selects a mode and nothing else; product scope is unrestricted", () => {
  validateThemeOverride({ scope: "user", mode: "dark" });
  assert.throws(() => validateThemeOverride({ scope: "user", tokens: { "color.accent.default": "#123456" } }), TokenContractError);
  assert.throws(() => validateThemeOverride({ scope: "tenant", mode: "dark" }), TokenContractError);
  assert.throws(() => validateThemeOverride({ scope: "root", tokens: {} }), TokenContractError);
  validateThemeOverride({ scope: "product", tokens: { "color.surface.default": "#101010" } });
});

test("every declared pair clears WCAG 2.2 AA in both themes", () => {
  assert.ok(contrastRequirements.length > 0);
  const covered = new Set(contrastRequirements.map((item) => item.foreground));
  for (const id of TOKEN_IDS.filter((token) => token.startsWith("color.text."))) {
    assert.ok(covered.has(id), `${id} has no contrast requirement`);
  }
  for (const theme of themes) {
    for (const requirement of contrastRequirements) {
      const ratio = contrastRatio(theme.tokens[requirement.foreground], theme.tokens[requirement.background]);
      const minimum = MINIMUM[requirement.level] as number;
      assert.ok(ratio >= minimum,
        `${theme.mode}: ${requirement.foreground} on ${requirement.background} is ${ratio.toFixed(2)}:1, below ${minimum}:1`);
    }
  }
});

test("contrast maths matches known WCAG reference values", () => {
  assert.equal(Number(contrastRatio("#000000", "#ffffff").toFixed(2)), 21);
  assert.equal(Number(contrastRatio("#ffffff", "#ffffff").toFixed(2)), 1);
  assert.equal(Number(contrastRatio("#777777", "#ffffff").toFixed(2)), 4.48);
  assert.throws(() => contrastRatio("red", "#ffffff"), TokenContractError);
});

test("the validator agrees with the schema's additionalProperties: false", () => {
  assert.throws(() => validateTheme({ ...defaultLightTheme, evil: 1 }), TokenContractError);
  assert.throws(() => validateThemeOverride({ scope: "product", tokens: {}, evil: 1 }), TokenContractError);
});

test("typography grammar is per role, not per category", () => {
  const bad: Array<[TokenId, string]> = [
    ["typography.body.size", "Inter"],
    ["typography.family.sans", "600"],
    ["typography.heading.weight", "14px"],
    ["typography.caption.lineHeight", "Inter"]
  ];
  for (const [id, value] of bad) {
    assert.throws(() => validateTheme(withToken(defaultLightTheme, id, value)), TokenContractError, `${id} accepted ${value}`);
  }
  validateTheme(withToken(defaultLightTheme, "typography.body.lineHeight", "1.5"));
  validateTheme(withToken(defaultLightTheme, "typography.heading.weight", "700"));
});

test("validation returns a detached, frozen result", () => {
  const input = JSON.parse(JSON.stringify(defaultLightTheme));
  const validated = validateTheme(input);
  assert.notEqual(validated, input, "must not alias the untrusted input");
  assert.ok(Object.isFrozen(validated) && Object.isFrozen(validated.tokens));
  input.tokens["color.text.primary"] = "#ffffff";
  assert.equal(validated.tokens["color.text.primary"], defaultLightTheme.tokens["color.text.primary"],
    "mutating the input must not change the validated theme");
});

test("the contract surface cannot be mutated by a consumer", () => {
  assert.ok(Object.isFrozen(contrastRequirements));
  for (const requirement of contrastRequirements) assert.ok(Object.isFrozen(requirement), `${requirement.foreground} entry is mutable`);
  assert.ok(Object.isFrozen(defaultLightTheme.tokens) && Object.isFrozen(defaultDarkTheme.tokens));
});

test("contrast helpers reject bad input with a typed error, not a TypeError", () => {
  for (const bad of [undefined, null, 42, {}, "not-a-colour"]) {
    assert.throws(() => contrastRatio(bad as unknown as string, "#ffffff"), TokenContractError, `accepted ${String(bad)}`);
  }
});

test("the published schemas match the contract", async () => {
  const theme = JSON.parse(await readFile(resolve(root, "schemas/theme.schema.json"), "utf8"));
  assert.deepEqual(Object.keys(theme.properties.tokens.properties).sort(), [...TOKEN_IDS].sort());
  assert.deepEqual([...theme.properties.tokens.required].sort(), [...TOKEN_IDS].sort());
  const override = JSON.parse(await readFile(resolve(root, "schemas/theme-override.schema.json"), "utf8"));
  assert.deepEqual(override.properties.scope.enum, ["product", "tenant", "user"]);
  assert.deepEqual(override.required, ["scope"]);
});
