import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  TOKENS_CONTRACT_VERSION, SUPPORTED_TOKEN_MAJORS, TOKEN_CATEGORIES, TOKEN_IDS, contrastRatio, contrastRequirements,
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

test("the contract version is enforced and fails closed on an unreadable major", () => {
  validateTheme({ ...defaultLightTheme, version: { major: 1, minor: 0 } });
  for (const version of [{ major: 99, minor: 0 }, { major: 0, minor: 0 }, { major: -1, minor: 0 },
                         { major: 1.5, minor: 0 }, { major: 1, minor: -1 }, { major: "1", minor: 0 }]) {
    assert.throws(() => validateTheme({ ...defaultLightTheme, version }), TokenContractError,
      `accepted version ${JSON.stringify(version)}`);
  }
  assert.deepEqual([...SUPPORTED_TOKEN_MAJORS], [TOKENS_CONTRACT_VERSION.major]);
});

test("numeric token values are bounded, not merely well-formed", () => {
  const outOfRange: Array<[TokenId, string]> = [
    ["spacing.100", "99999px"],
    ["typography.body.size", "999px"],
    ["motion.slow", "99999999ms"],
    ["density.comfortable", "999999"],
    ["motion.easing.standard", "cubic-bezier(1,2,3,4,5,6,7,8)"],
    ["motion.easing.standard", "cubic-bezier(5, 0, 0.2, 1)"]
  ];
  for (const [id, value] of outOfRange) {
    assert.throws(() => validateTheme(withToken(defaultLightTheme, id, value)), TokenContractError, `${id} accepted ${value}`);
  }
  validateTheme(withToken(defaultLightTheme, "spacing.100", "1rem"));
  validateTheme(withToken(defaultLightTheme, "motion.easing.standard", "cubic-bezier(0.2, 0, 0, 1)"));
});

test("token values must be strings within the length bound", () => {
  // Probe a free-form token. A colour token's #rrggbb grammar would reject an empty or
  // over-long value on its own, masking the length check entirely.
  const anyToken = TOKEN_IDS.find((id) => id.startsWith("elevation.")) as TokenId;
  assert.ok(anyToken, "a free-form token is required to exercise the length bound directly");
  for (const bad of [42, null, true, {}, []]) {
    assert.throws(() => validateTheme(withToken(defaultLightTheme, anyToken, bad as unknown as string)),
      TokenContractError, `accepted a ${typeof bad} token value`);
  }
  assert.throws(() => validateTheme(withToken(defaultLightTheme, anyToken, "")), TokenContractError, "accepted an empty value");
  assert.throws(() => validateTheme(withToken(defaultLightTheme, anyToken, "a".repeat(201))), TokenContractError, "accepted an over-long value");
});

test("the tokens map itself must be an object, on both validation paths", () => {
  for (const tokens of ["x", 42, null, []]) {
    assert.throws(() => validateTheme({ ...defaultLightTheme, tokens }), TokenContractError,
      `validateTheme accepted tokens: ${typeof tokens}`);
    assert.throws(() => validateThemeOverride({ scope: "product", tokens }), TokenContractError,
      `validateThemeOverride accepted tokens: ${typeof tokens}`);
  }
});

test("overrides reject unknown token ids in every scope", () => {
  for (const scope of ["product", "tenant"]) {
    assert.throws(() => validateThemeOverride({ scope, tokens: { "made.up.token": "#123456" } }),
      TokenContractError, `${scope} accepted an unknown token id`);
  }
});

test("tokenCategory rejects anything that is not a registered token", () => {
  assert.equal(tokenCategory("color.text.primary"), "color");
  for (const bad of [undefined, null, 42, "not.a.token", ""]) {
    assert.throws(() => tokenCategory(bad as unknown as TokenId), TokenContractError, `accepted ${String(bad)}`);
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
