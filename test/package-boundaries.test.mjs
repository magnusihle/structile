import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const boundaries = JSON.parse(await readFile(resolve(root, "architecture/package-boundaries.json"), "utf8"));
const expected = [
  "@structile/tokens", "@structile/primitives", "@structile/components", "@structile/catalog",
  "@structile/spec", "@structile/runtime", "@structile/composer", "@structile/charts",
  "@structile/i18n", "@structile/capability-sdk", "@structile/auth", "@structile/control-plane",
  "@structile/agent-harness"
];

test("all canonical core package boundaries exist exactly once", async () => {
  assert.deepEqual(boundaries.packages.map((entry) => entry.name), expected);
  assert.equal(new Set(expected).size, expected.length);
  assert.deepEqual(boundaries.externalPackages.map((entry) => entry.name), ["@structile/conformance"]);
  for (const entry of boundaries.packages) {
    const manifest = JSON.parse(await readFile(resolve(root, entry.path, "package.json"), "utf8"));
    assert.equal(manifest.name, entry.name);
    assert.equal(manifest.private, true, `${entry.name} must not publish during bootstrap`);
  }
});

test("later-gate packages contain only explicit G0 boundary exports", async () => {
  for (const entry of boundaries.packages.filter((item) => item.name !== "@structile/agent-harness")) {
    const source = await readFile(resolve(root, entry.path, "src/index.ts"), "utf8");
    assert.match(source, /status: "g0-placeholder"/);
    assert.match(source, new RegExp(`implementationGate: "${entry.introducedGate}"`));
    assert.doesNotMatch(source, /function\s|class\s|fetch\s*\(|createServer|BetterAuth|LangGraph/i);
  }
});
