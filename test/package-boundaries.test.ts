import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
interface PackageBoundary {
  name: string;
  path: string;
  introducedGate: string;
}

const boundaries = JSON.parse(await readFile(resolve(root, "architecture/package-boundaries.json"), "utf8")) as {
  packages: PackageBoundary[];
  externalPackages: Array<{ name: string }>;
};
const expected = [
  "@structile/tokens", "@structile/primitives", "@structile/components", "@structile/catalog",
  "@structile/spec", "@structile/runtime", "@structile/composer", "@structile/charts",
  "@structile/i18n", "@structile/capability-sdk", "@structile/auth", "@structile/control-plane",
  "@structile/agent-harness"
];

test("implemented packages are a subset of the declared boundaries", () => {
  const declared = new Set(boundaries.packages.map((entry) => entry.name));
  for (const name of implemented) assert.ok(declared.has(name), `${name} is not a declared boundary`);
});

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

/**
 * Packages implemented so far. The G0 placeholder assertion below narrows as each gate
 * lands; a package may only leave this list when its contract is actually implemented.
 */
const implemented = new Set(["@structile/agent-harness", "@structile/tokens"]);

test("packages awaiting their gate contain only explicit boundary exports", async () => {
  for (const entry of boundaries.packages.filter((item) => !implemented.has(item.name))) {
    const source = await readFile(resolve(root, entry.path, "src/index.ts"), "utf8");
    assert.match(source, /status: "g0-placeholder"/);
    assert.match(source, new RegExp(`implementationGate: "${entry.introducedGate}"`));
    assert.doesNotMatch(source, /function\s|class\s|fetch\s*\(|createServer|BetterAuth|LangGraph/i);
  }
});
