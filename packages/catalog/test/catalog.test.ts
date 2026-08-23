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
  // Include every mandatory state, so the unknown-state check is the only one that can fire.
  assert.throws(() => validateRegistration({ ...clone(), states: ["loading", "error", "ready", "teleporting"] }),
    CatalogError, "unknown state accepted");
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

test("prop schemas are validated field by field", () => {
  assert.throws(() => validateRegistration({ ...clone(),
    props: { type: "object", additionalProperties: false, properties: { "Bad Name": { type: "string" } } } }),
    CatalogError, "invalid prop name accepted");
  assert.throws(() => validateRegistration({ ...clone(),
    props: { type: "object", additionalProperties: false, properties: { label: {} } } }),
    CatalogError, "prop without a declared type accepted");
});

test("the accessibility contract requires every field to be non-empty", () => {
  for (const field of ["role", "keyboard", "labelledBy"]) {
    const a11y = { role: "group", keyboard: "tab", focusOrder: "dom", labelledBy: "label" } as Record<string, string>;
    a11y[field] = "";
    assert.throws(() => validateRegistration({ ...clone(), accessibility: a11y }), CatalogError, `empty ${field} accepted`);
  }
});

test("data needs name a resource and plain fields", () => {
  assert.throws(() => validateRegistration({ ...clone(), dataNeeds: ["orders"] }), CatalogError, "non-object dataNeed accepted");
  assert.throws(() => validateRegistration({ ...clone(), dataNeeds: [{ resource: "", fields: ["id"] }] }), CatalogError, "empty resource accepted");
  assert.throws(() => validateRegistration({ ...clone(), dataNeeds: [{ resource: "orders", fields: ["Not A Field"] }] }), CatalogError);
  assert.throws(() => validateRegistration({ ...clone(), dataNeeds: [{ resource: "orders", fields: "id" }] }), CatalogError);
});

test("permissions must be dotted lowercase", () => {
  for (const permission of ["Orders.Read", "orders read", "orders", "ORDERS.READ"]) {
    assert.throws(() => validateRegistration({ ...clone(), permissions: [permission] }), CatalogError, `accepted ${permission}`);
  }
  validateRegistration({ ...clone(), permissions: ["orders.read"] });
});

test("the registration version must be integral", () => {
  for (const version of [{ major: "1", minor: 0 }, { major: 1.5, minor: 0 }, { major: 1 }, "1.0", null]) {
    assert.throws(() => validateRegistration({ ...clone(), version }), CatalogError, `accepted ${JSON.stringify(version)}`);
  }
});

test("slots are bounded in number and shape", () => {
  const many = Array.from({ length: 17 }, (_, index) => ({ name: `slot${index}`, maxChildren: 1 }));
  assert.throws(() => validateRegistration({ ...clone(), slots: many }), CatalogError, "slot count not bounded");
  assert.throws(() => validateRegistration({ ...clone(), slots: ["content"] }), CatalogError, "non-object slot accepted");
  assert.throws(() => validateRegistration({ ...clone(),
    slots: [{ name: "content", maxChildren: 1, accepts: "core.kpi" }] }), CatalogError, "non-array accepts accepted");
  validateRegistration({ ...clone(), slots: [{ name: "content", maxChildren: 1, accepts: ["core.kpi"] }] });
});

test("the validator agrees with the schema on unknown keys, duplicates and version bounds", () => {
  assert.throws(() => validateRegistration({ ...clone(), extra: 1 }), CatalogError, "unknown property accepted");
  assert.throws(() => validateRegistration({ ...clone(), states: ["loading", "error", "ready", "ready"] }),
    CatalogError, "duplicate state accepted");
  assert.throws(() => validateRegistration({ ...clone(), version: { major: 0, minor: 0 } }),
    CatalogError, "version.major below the schema minimum accepted");
  assert.throws(() => validateRegistration({ ...clone(), version: { major: 1, minor: -1 } }), CatalogError);
});

test("the published schema matches the validator's required fields", async () => {
  const schema = JSON.parse(await readFile(resolve(root, "schemas/component-registration.schema.json"), "utf8"));
  assert.deepEqual([...schema.required].sort(),
    ["accessibility","cost","dataNeeds","id","permissions","props","slots","states","version"]);
  assert.deepEqual(schema.properties.states.items.enum, [...COMPONENT_STATES]);
});
