import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalog } from "@structile/catalog";
import { LIMITS, SPEC_SCHEMA_VERSION, SUPPORTED_SPEC_MAJORS, SpecificationError,
         compatibilityMatrix, negotiateSpecVersion, validateSpecification } from "../dist/index.js";

const registration = (id: string, props: Record<string, string>, slots: string[] = []) => ({
  id, version: { major: 1, minor: 0 },
  props: { type: "object" as const, additionalProperties: false as const,
           properties: Object.fromEntries(Object.entries(props).map(([k, t]) => [k, { type: t }])),
           required: Object.keys(props) },
  slots: slots.map((name) => ({ name, maxChildren: 32 })),
  states: ["loading", "empty", "forbidden", "error", "ready"] as const,
  accessibility: { role: "group", keyboard: "tab", focusOrder: "dom" as const, labelledBy: "label" },
  dataNeeds: [], permissions: [], cost: { staticWeight: 1, maxRows: 100 }
});

const catalog = buildCatalog([
  registration("core.kpi", { label: "string", metric: "string" }),
  registration("core.stack", {}, ["content"])
]);

const base = {
  specVersion: { major: 1, minor: 0 },
  id: "app.example",
  title: "Example",
  pages: [{ id: "home", path: "/", nodes: [{ componentId: "core.kpi", props: { label: "Total", metric: "orders" }, slots: {} }] }]
};
const clone = (): Record<string, any> => JSON.parse(JSON.stringify(base));

test("a valid specification round-trips to a detached copy", () => {
  const first = validateSpecification(base, { catalog });
  const second = validateSpecification(JSON.parse(JSON.stringify(first)), { catalog });
  assert.deepEqual(second, first);
  assert.notEqual(first, base, "must return a detached copy, not the input");
});

test("version negotiation fails closed and the matrix is declared", () => {
  assert.deepEqual(negotiateSpecVersion({ major: 1, minor: 0 }), { major: 1, minor: SPEC_SCHEMA_VERSION.minor });
  assert.throws(() => negotiateSpecVersion({ major: 999, minor: 0 }), SpecificationError);
  assert.throws(() => negotiateSpecVersion({ major: "1" }), SpecificationError);
  const matrix = compatibilityMatrix();
  assert.equal(matrix.current, SPEC_SCHEMA_VERSION.major);
  assert.equal(matrix.previous, null, "only one major exists so far");
  assert.deepEqual(matrix.migrations, []);
  assert.equal(matrix.rollback, "not-yet-applicable");
  assert.deepEqual([...matrix.supported], [...SUPPORTED_SPEC_MAJORS]);
});

test("prototype pollution is rejected wherever it appears", () => {
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const payload = JSON.parse(JSON.stringify(base).replace(/^\{/, `{${JSON.stringify(key)}:{"polluted":true},`));
    assert.ok(Object.hasOwn(payload, key), "probe must create a real own property");
    assert.throws(() => validateSpecification(payload, { catalog }), SpecificationError, `top-level ${key} accepted`);
  }
  const nested = JSON.parse(JSON.stringify(base).replace(/"pages":\[\{/, '"pages":[{"__proto__":{"polluted":true},'));
  const control = JSON.parse(JSON.stringify(nested));
  delete control.pages[0]["__proto__"];
  validateSpecification(control, { catalog });
  assert.throws(() => validateSpecification(nested, { catalog }), SpecificationError, "nested pollution accepted");
  assert.equal(({} as Record<string, unknown>).polluted, undefined, "Object.prototype was polluted");
});

test("pollution inside a declared prop value is rejected", () => {
  // Neither additionalProperties nor the unknown-prop check reaches inside the *value* of a
  // declared prop, so this path is covered by the deep scan alone. Probing only the page or
  // node level would let the scan be deleted unnoticed.
  const deep = buildCatalog([
    { ...registration("core.deep", { config: "object" }), props: { type: "object", additionalProperties: false,
      properties: { config: { type: "object" } }, required: ["config"] } }
  ]);
  const control = JSON.parse(
    `{"specVersion":{"major":1,"minor":0},"id":"app.x","title":"T","pages":[{"id":"home","path":"/","nodes":[{"componentId":"core.deep","props":{"config":{"safe":1}},"slots":{}}]}]}`);
  validateSpecification(control, { catalog: deep });
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const poisoned = JSON.parse(
      `{"specVersion":{"major":1,"minor":0},"id":"app.x","title":"T","pages":[{"id":"home","path":"/","nodes":[{"componentId":"core.deep","props":{"config":{${JSON.stringify(key)}:{"isAdmin":true}}},"slots":{}}]}]}`);
    assert.throws(() => validateSpecification(poisoned, { catalog: deep }), SpecificationError,
      `${key} nested in a prop value was accepted`);
  }
  assert.equal(({} as Record<string, unknown>).isAdmin, undefined, "Object.prototype was polluted");
});

test("code, markup, template, SQL and URL payloads are rejected", () => {
  for (const payload of ["<script>x</script>", "<b>x</b>", "javascript:x", "data:text/html,x", "onload=x",
                         "expression(1)", "url(x)", "{{x}}", "1; DROP TABLE t --",
                         "https://example.invalid/x", "//example.invalid/x"]) {
    const poisoned = clone(); poisoned.title = payload;
    assert.throws(() => validateSpecification(poisoned, { catalog }), SpecificationError, `accepted ${payload}`);
  }
});

test("non-data values are rejected with a typed error, not a raw TypeError", () => {
  // In props, not title: `title` has its own must-be-a-string check that would mask this.
  for (const value of [() => 1, Symbol("x"), BigInt(1), Number.POSITIVE_INFINITY, Number.NaN]) {
    const poisoned = clone(); poisoned.pages[0].nodes[0].props.label = value;
    assert.throws(() => validateSpecification(poisoned, { catalog }), SpecificationError, `accepted ${String(value)}`);
  }
});

test("an over-long string is rejected even when the document is small", () => {
  // Many short strings would trip maxBytes instead; one long string isolates the string bound.
  const poisoned = clone();
  poisoned.pages[0].nodes[0].props.label = "a".repeat(5_000);
  assert.ok(JSON.stringify(poisoned).length < LIMITS.maxBytes, "probe must stay under maxBytes");
  assert.throws(() => validateSpecification(poisoned, { catalog }), SpecificationError);
});

test("node, props and slot shapes are validated", () => {
  const notANode = clone(); notANode.pages[0].nodes = ["core.kpi"];
  assert.throws(() => validateSpecification(notANode, { catalog }), SpecificationError, "non-object node accepted");
  const badProps = clone(); badProps.pages[0].nodes[0].props = "label";
  assert.throws(() => validateSpecification(badProps, { catalog }), SpecificationError, "non-object props accepted");
  const badSlots = clone(); badSlots.pages[0].nodes[0].slots = [];
  assert.throws(() => validateSpecification(badSlots, { catalog }), SpecificationError, "non-object slots accepted");
  // Children are otherwise valid, so exceeding the declared bound is the only defect.
  const child = { componentId: "core.kpi", props: { label: "a", metric: "b" }, slots: {} };
  const withinBound = clone();
  withinBound.pages[0].nodes = [{ componentId: "core.stack", props: {}, slots: { content: Array.from({ length: 32 }, () => child) } }];
  validateSpecification(withinBound, { catalog });
  const overfull = clone();
  overfull.pages[0].nodes = [{ componentId: "core.stack", props: {}, slots: { content: Array.from({ length: 33 }, () => child) } }];
  assert.throws(() => validateSpecification(overfull, { catalog }), SpecificationError, "slot maxChildren not enforced");
});

test("page shape and identity are validated", () => {
  const notAPage = clone(); notAPage.pages = ["home"];
  assert.throws(() => validateSpecification(notAPage, { catalog }), SpecificationError, "non-object page accepted");
  const badId = clone(); badId.pages[0].id = "Not An Id";
  assert.throws(() => validateSpecification(badId, { catalog }), SpecificationError, "invalid page id accepted");
  const badPath = clone(); badPath.pages[0].path = "no-leading-slash";
  assert.throws(() => validateSpecification(badPath, { catalog }), SpecificationError, "invalid route accepted");
  for (const title of [undefined, "", 42]) {
    const bad = clone(); bad.title = title;
    assert.throws(() => validateSpecification(bad, { catalog }), SpecificationError, `accepted title ${String(title)}`);
  }
});

test("a specification that cannot be serialised is rejected as a SpecificationError", () => {
  const cyclic = clone();
  cyclic.pages[0].nodes[0].props.label = cyclic;
  assert.throws(() => validateSpecification(cyclic, { catalog }), SpecificationError);
});

test("the static cost budget is enforced", () => {
  // maxNodes x the default weight never reaches maxCost, so the earlier version of this
  // test could not fire at all. Use a deliberately expensive component instead.
  const costly = buildCatalog([
    registration("core.kpi", { label: "string", metric: "string" }),
    { ...registration("core.heavy", { label: "string" }), cost: { staticWeight: 100, maxRows: 100 } }
  ]);
  const needed = Math.ceil(LIMITS.maxCost / 100) + 1;
  assert.ok(needed <= LIMITS.maxNodes, "the cost ceiling must be reachable within maxNodes");
  const doc = clone();
  doc.pages[0].nodes = Array.from({ length: needed },
    () => ({ componentId: "core.heavy", props: { label: "a" }, slots: {} }));
  assert.throws(() => validateSpecification(doc, { catalog: costly }), SpecificationError, "maxCost not enforced");
  const under = clone();
  under.pages[0].nodes = Array.from({ length: needed - 2 },
    () => ({ componentId: "core.heavy", props: { label: "a" }, slots: {} }));
  validateSpecification(under, { catalog: costly });
});

test("catalog escape is rejected", () => {
  const unknownComponent = clone(); unknownComponent.pages[0].nodes[0].componentId = "not.registered";
  assert.throws(() => validateSpecification(unknownComponent, { catalog }), SpecificationError);
  const unknownProp = clone(); unknownProp.pages[0].nodes[0].props.ghost = 1;
  assert.throws(() => validateSpecification(unknownProp, { catalog }), SpecificationError);
  const missingProp = clone(); delete missingProp.pages[0].nodes[0].props.metric;
  assert.throws(() => validateSpecification(missingProp, { catalog }), SpecificationError);
  const undeclaredSlot = clone(); undeclaredSlot.pages[0].nodes[0].slots = { nope: [] };
  assert.throws(() => validateSpecification(undeclaredSlot, { catalog }), SpecificationError);
});

test("every declared limit is enforced", () => {
  const deepNode = (levels: number): unknown => {
    let node: unknown = { componentId: "core.kpi", props: { label: "a", metric: "b" }, slots: {} };
    for (let i = 0; i < levels; i += 1) node = { componentId: "core.stack", props: {}, slots: { content: [node] } };
    return node;
  };
  const tooDeep = clone(); tooDeep.pages[0].nodes = [deepNode(LIMITS.maxDepth + 1)];
  assert.throws(() => validateSpecification(tooDeep, { catalog }), SpecificationError, "maxDepth not enforced");

  const tooMany = clone();
  tooMany.pages[0].nodes = Array.from({ length: LIMITS.maxNodes + 1 },
    () => ({ componentId: "core.kpi", props: { label: "a", metric: "b" }, slots: {} }));
  assert.throws(() => validateSpecification(tooMany, { catalog }), SpecificationError, "maxNodes not enforced");

  // Many short strings: one giant string trips the per-string bound instead, masking this.
  const tooBig = clone();
  tooBig.pages[0].nodes = Array.from({ length: LIMITS.maxNodes },
    () => ({ componentId: "core.kpi", props: { label: "a".repeat(2_000), metric: "b".repeat(2_000) }, slots: {} }));
  assert.ok(JSON.stringify(tooBig).length > LIMITS.maxBytes, "probe must actually exceed maxBytes");
  assert.throws(() => validateSpecification(tooBig, { catalog }), SpecificationError, "maxBytes not enforced");

  const deepProps = clone();
  let nested: Record<string, unknown> = {};
  for (let i = 0; i < LIMITS.maxStructuralDepth * 3; i += 1) nested = { child: nested };
  deepProps.pages[0].nodes[0].props.label = nested;
  assert.throws(() => validateSpecification(deepProps, { catalog }), SpecificationError, "structural depth not enforced");
});

test("limits stay under the protected suite ceilings", () => {
  const ceilings = { maxDepth: 16, maxNodes: 400, maxBytes: 1_048_576, maxCost: 10_000 };
  for (const [name, ceiling] of Object.entries(ceilings)) {
    const declared = LIMITS[name as keyof typeof LIMITS];
    assert.ok(declared > 0 && declared <= ceiling, `LIMITS.${name} is ${declared}, above the ceiling ${ceiling}`);
  }
  assert.ok(LIMITS.maxNodes >= 100, "must be able to hold the Northstar fixture (~81 nodes)");
});

test("the validator enforces additionalProperties:false at every level", () => {
  const app = clone(); app.extra = 1;
  assert.throws(() => validateSpecification(app, { catalog }), SpecificationError, "unknown application key accepted");
  const page = clone(); page.pages[0].extra = 1;
  assert.throws(() => validateSpecification(page, { catalog }), SpecificationError, "unknown page key accepted");
  const node = clone(); node.pages[0].nodes[0].extra = 1;
  assert.throws(() => validateSpecification(node, { catalog }), SpecificationError, "unknown node key accepted");
  // the optional keys the schema does declare must still be accepted
  const optional = clone();
  optional.themeRef = "product"; optional.pages[0].titleKey = "page.home";
  optional.pages[0].nodes[0].queryRef = "orders.list";
  validateSpecification(optional, { catalog });
});

test("malformed envelopes are rejected", () => {
  assert.throws(() => validateSpecification("nope", { catalog }), SpecificationError);
  assert.throws(() => validateSpecification({ ...clone(), id: "Not An Id" }, { catalog }), SpecificationError);
  assert.throws(() => validateSpecification({ ...clone(), pages: {} }, { catalog }), SpecificationError);
  const duplicateRoute = clone();
  duplicateRoute.pages = [duplicateRoute.pages[0], JSON.parse(JSON.stringify(duplicateRoute.pages[0]))];
  assert.throws(() => validateSpecification(duplicateRoute, { catalog }), SpecificationError, "duplicate route accepted");
});
