import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CATALOG_CONTRACT_VERSION, COMPONENT_STATES, CatalogError, buildCatalog,
         validateRegistration } from "../dist/index.js";

const root = resolve(import.meta.dirname, "..");

const valid = {
  id: "core.kpi",
  version: { major: 1, minor: 0 },
  props: { type: "object", additionalProperties: false,
           properties: { label: { type: "string" }, metric: { type: "string" } }, required: ["label", "metric"] },
  slots: [],
  states: ["loading", "empty", "forbidden", "error", "ready"],
  accessibility: { role: "group", keyboard: "tab", focusOrder: "dom", labelledBy: "label" },
  dataNeeds: [{ resource: "orders", fields: ["total"] }],
  permissions: ["orders.read"],
  cost: { staticWeight: 1, maxRows: 100 }
};

const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(valid));

test("a complete registration validates", () => {
  validateRegistration(valid);
  assert.equal(CATALOG_CONTRACT_VERSION.major, 1);
  assert.deepEqual([...COMPONENT_STATES], ["loading", "empty", "forbidden", "error", "ready"]);
});

test("each of the nine DS-003 fields is required", () => {
  for (const field of ["id","version","props","slots","states","accessibility","dataNeeds","permissions","cost"]) {
    const broken = clone();
    delete broken[field];
    assert.throws(() => validateRegistration(broken), CatalogError, `${field} was not required`);
  }
});

test("component ids must be stable dotted lowercase", () => {
  for (const id of ["notdotted", "Core.Kpi", "core..kpi", "1core.kpi", "core.kpi!"]) {
    assert.throws(() => validateRegistration({ ...clone(), id }), CatalogError, `accepted id ${id}`);
  }
});

test("states, accessibility and cost are constrained", () => {
  assert.throws(() => validateRegistration({ ...clone(), states: "ready" }), CatalogError);
  assert.throws(() => validateRegistration({ ...clone(), states: ["ready", "teleporting"] }), CatalogError);
  assert.throws(() => validateRegistration({ ...clone(), states: ["empty"] }), CatalogError, "loading/error/ready are mandatory");
  assert.throws(() => validateRegistration({ ...clone(), accessibility: { role: "group", keyboard: "tab", focusOrder: "auto", labelledBy: "l" } }), CatalogError);
  assert.throws(() => validateRegistration({ ...clone(), cost: { staticWeight: "one", maxRows: 10 } }), CatalogError);
  assert.throws(() => validateRegistration({ ...clone(), cost: { staticWeight: 1 } }), CatalogError);
  assert.throws(() => validateRegistration({ ...clone(), cost: { staticWeight: 1, maxRows: 999999 } }), CatalogError);
});

test("props must be a closed JSON Schema object", () => {
  assert.throws(() => validateRegistration({ ...clone(), props: { type: "object", additionalProperties: true, properties: {} } }), CatalogError);
  assert.throws(() => validateRegistration({ ...clone(), props: { type: "array", additionalProperties: false, properties: {} } }), CatalogError);
  assert.throws(() => validateRegistration({ ...clone(), props: { type: "object", additionalProperties: false, properties: {}, required: ["ghost"] } }), CatalogError);
});

test("slots are bounded and named", () => {
  validateRegistration({ ...clone(), slots: [{ name: "content", maxChildren: 32 }] });
  assert.throws(() => validateRegistration({ ...clone(), slots: [{ name: "Content", maxChildren: 1 }] }), CatalogError);
  assert.throws(() => validateRegistration({ ...clone(), slots: [{ name: "content", maxChildren: 9999 }] }), CatalogError);
});

test("buildCatalog rejects duplicate component ids", () => {
  const catalog = buildCatalog([valid]);
  assert.equal(catalog.schemaVersion, "1.0.0");
  assert.equal(catalog.components.length, 1);
  assert.throws(() => buildCatalog([valid, clone()]), CatalogError);
  assert.deepEqual(buildCatalog([]).components, []);
});

test("buildCatalog reports which entry failed", () => {
  try {
    buildCatalog([valid, { id: "core.broken" }]);
    assert.fail("expected rejection");
  } catch (error) {
    const failure = error as CatalogError;
    assert.ok(failure.violations.some((v) => v.startsWith("[1] ")), "violations must be attributed to an index");
  }
});

test("the published schema matches the validator's required fields", async () => {
  const schema = JSON.parse(await readFile(resolve(root, "schemas/component-registration.schema.json"), "utf8"));
  assert.deepEqual([...schema.required].sort(),
    ["accessibility","cost","dataNeeds","id","permissions","props","slots","states","version"]);
  assert.deepEqual(schema.properties.states.items.enum, [...COMPONENT_STATES]);
});
