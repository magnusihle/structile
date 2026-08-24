import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ACTION_EXECUTION_ENABLED, CAPABILITY_PROTOCOL_VERSION, CapabilityContractError, CapabilityErrorCode,
  MANIFEST_KEYS, PRINCIPAL_AUDIENCE, SUPPORTED_PROTOCOL_VERSIONS, assertExecutionDisabled,
  negotiateProtocolVersion, validateActionDeclaration, validateCapabilityManifest
} from "../dist/index.js";

const root = resolve(import.meta.dirname, "..");
const manifest = {
  contractVersion: { major: 1, minor: 0 },
  resources: [{ name: "orders", fields: ["id", "total"] }, { name: "suppliers", fields: ["id"] }],
  fields: ["orders.total"], metrics: ["orders.count"], filters: ["orders.status"],
  relationships: [{ name: "order_supplier", from: "orders", to: "suppliers" }],
  queries: ["orders.list"], exports: ["orders.csv"], actions: ["orders.cancel"],
  signature: "sig-abc"
};
const declaration = JSON.parse(
  await readFile(resolve(root, "fixtures/action-declaration.valid.json"), "utf8")) as Record<string, unknown>;
const clone = (): Record<string, any> => JSON.parse(JSON.stringify(declaration));

test("version negotiation picks a supported major and otherwise fails closed", () => {
  assert.deepEqual(negotiateProtocolVersion([{ major: 1, minor: 0 }]),
    { major: 1, minor: CAPABILITY_PROTOCOL_VERSION.minor });
  for (const offered of [[], [{ major: 999, minor: 0 }], "1", [{ major: "1" }]]) {
    assert.throws(() => negotiateProtocolVersion(offered), (error: unknown) =>
      error instanceof CapabilityContractError && error.code === CapabilityErrorCode.UNSUPPORTED_CONTRACT_VERSION);
  }
  assert.ok(SUPPORTED_PROTOCOL_VERSIONS.length >= 1);
  assert.equal(PRINCIPAL_AUDIENCE, "structile-control-plane");
});

test("manifests fail closed on version, shape and signature with stable codes", () => {
  validateCapabilityManifest(manifest);
  const expect = (value: unknown, code: string): void => {
    assert.throws(() => validateCapabilityManifest(value),
      (error: unknown) => error instanceof CapabilityContractError && error.code === code,
      `expected ${code}`);
  };
  expect({}, CapabilityErrorCode.MALFORMED_MANIFEST);
  expect({ ...manifest, contractVersion: { major: 2, minor: 0 } }, CapabilityErrorCode.UNSUPPORTED_CONTRACT_VERSION);
  expect({ ...manifest, signature: "" }, CapabilityErrorCode.UNSIGNED_MANIFEST);
  // A present-but-empty signature is unsigned, not malformed; an absent key is malformed.
  expect({ ...manifest, signature: undefined }, CapabilityErrorCode.UNSIGNED_MANIFEST);
  for (const key of MANIFEST_KEYS) {
    const incomplete = { ...manifest } as Record<string, unknown>;
    delete incomplete[key];
    assert.throws(() => validateCapabilityManifest(incomplete), CapabilityContractError, `${key} not required`);
  }
});

test("manifest collections are shape-checked when present", () => {
  for (const key of ["fields", "metrics", "filters", "queries", "exports", "actions"]) {
    assert.throws(() => validateCapabilityManifest({ ...manifest, [key]: "orders.total" }),
      CapabilityContractError, `${key} accepted a bare string`);
    assert.throws(() => validateCapabilityManifest({ ...manifest, [key]: [42] }),
      CapabilityContractError, `${key} accepted a non-string member`);
  }
  // Clear relationships first: they name declared resources, so replacing `resources`
  // would trip the relationship check and mask the resource-shape check entirely.
  const noRelations = { ...manifest, relationships: [] };
  for (const resources of ["orders", [42], [{ name: "orders" }], [{ fields: ["id"] }],
                           [{ name: 42, fields: ["id"] }], [{ name: "orders", fields: "id" }],
                           [{ name: "orders", fields: [42] }]]) {
    assert.throws(() => validateCapabilityManifest({ ...noRelations, resources }),
      CapabilityContractError, `accepted resources ${JSON.stringify(resources)}`);
  }
  validateCapabilityManifest({ ...noRelations, resources: [{ name: "orders", fields: ["id"] }] });
  for (const relationships of ["x", [42], [{ from: "orders", to: "suppliers" }], [{ name: 42, from: "orders", to: "suppliers" }]]) {
    assert.throws(() => validateCapabilityManifest({ ...manifest, relationships }),
      CapabilityContractError, `accepted relationships ${JSON.stringify(relationships)}`);
  }
});

test("relationships must resolve to declared resources", () => {
  assert.throws(() => validateCapabilityManifest({
    ...manifest, relationships: [{ name: "ghost", from: "orders", to: "not_declared" }]
  }), CapabilityContractError);
});

test("errors carry a stable code and an optional request id", () => {
  try {
    validateCapabilityManifest({}, "req-123");
    assert.fail("expected rejection");
  } catch (error) {
    const failure = error as CapabilityContractError;
    assert.equal(failure.code, CapabilityErrorCode.MALFORMED_MANIFEST);
    assert.equal(failure.requestId, "req-123");
    assert.ok(failure.violations.length > 0);
  }
});

test("every ACT-001 field is required", () => {
  validateActionDeclaration(declaration);
  for (const field of Object.keys(declaration)) {
    const incomplete = clone();
    delete incomplete[field];
    assert.throws(() => validateActionDeclaration(incomplete), CapabilityContractError, `${field} not required`);
  }
});

test("risk, mode, batch, timeout and retry are constrained", () => {
  for (const risk of ["normal", "destructive", "bulk", "high-impact"]) {
    // bulk must be able to batch; the other risks must not, so pair each consistently
    validateActionDeclaration({ ...clone(), risk, maxBatchSize: risk === "bulk" ? 10 : 1,
      preview: { required: true, effectSummary: "x" } });
  }
  assert.throws(() => validateActionDeclaration({ ...clone(), risk: "trivial" }), CapabilityContractError);
  assert.throws(() => validateActionDeclaration({ ...clone(), mode: "fire-and-forget" }), CapabilityContractError);
  assert.throws(() => validateActionDeclaration({ ...clone(), maxBatchSize: 0 }), CapabilityContractError);
  assert.throws(() => validateActionDeclaration({ ...clone(), maxBatchSize: 99999 }), CapabilityContractError);
  assert.throws(() => validateActionDeclaration({ ...clone(), timeoutMs: 999999 }), CapabilityContractError);
  assert.throws(() => validateActionDeclaration({ ...clone(), retry: { classification: "maybe" } }), CapabilityContractError);
});

test("each action field is validated when present, not merely required", () => {
  // The missing-field loop above covers absence. These probes supply a present-but-invalid
  // value, which is the only way to exercise the validity checks themselves.
  const bad: Array<[string, unknown]> = [
    ["id", "Not An Id"], ["id", "notdotted"], ["id", "../../etc/passwd"], ["id", ""], ["id", 42],
    ["version", { major: 1.5, minor: 0 }], ["version", { minor: 0 }], ["version", "1.0"],
    ["input", "object"], ["input", { type: "array", properties: {} }], ["input", { type: "object" }],
    ["output", 42],
    ["permissions", "orders.write"], ["permissions", [42]],
    ["audit", { fields: "orderId" }], ["audit", []],
    ["redaction", { fields: 42 }]
  ];
  for (const [field, value] of bad) {
    assert.throws(() => validateActionDeclaration({ ...clone(), [field]: value }),
      CapabilityContractError, `${field} accepted ${JSON.stringify(value)}`);
  }
});

test("scope entries are shape-checked and unknown kinds are refused", () => {
  for (const scope of [[{ kind: "resource" }], [{ value: "orders" }], ["orders"], [42], [{ kind: 42, value: "x" }]]) {
    assert.throws(() => validateActionDeclaration({ ...clone(), scope }),
      CapabilityContractError, `accepted scope ${JSON.stringify(scope)}`);
  }
  // A kind that is neither allowed nor on the forbidden list must still be refused:
  // the allow-list is the contract, not the deny-list.
  assert.throws(() => validateActionDeclaration({ ...clone(), scope: [{ kind: "galaxy", value: "x" }] }),
    CapabilityContractError, "unknown scope kind accepted");
});

test("preview, idempotency and concurrency are validated when present", () => {
  for (const preview of [{ required: "yes", effectSummary: "x" }, { required: true }, { effectSummary: "x" }, "required", { required: true, effectSummary: "" }]) {
    assert.throws(() => validateActionDeclaration({ ...clone(), preview }),
      CapabilityContractError, `accepted preview ${JSON.stringify(preview)}`);
  }
  for (const idempotency of [{ keyRule: "guessed", windowSeconds: 60 }, { keyRule: "derived", windowSeconds: 0 },
                             { keyRule: "derived", windowSeconds: -1 }, { keyRule: "derived", windowSeconds: 1.5 },
                             { keyRule: "derived" }, "client-supplied"]) {
    assert.throws(() => validateActionDeclaration({ ...clone(), idempotency }),
      CapabilityContractError, `accepted idempotency ${JSON.stringify(idempotency)}`);
  }
  for (const concurrency of [{ optimisticToken: "Not A Field" }, { optimisticToken: "" }, { optimisticToken: 42 }, {}, "version"]) {
    assert.throws(() => validateActionDeclaration({ ...clone(), concurrency }),
      CapabilityContractError, `accepted concurrency ${JSON.stringify(concurrency)}`);
  }
});

test("no action can opt out of preview, whatever its risk", () => {
  // Canonical architecture.md (structile-planning): "Normal updates require preview and confirmation." Preview is the
  // confirmation step for every mutation, not an escalation for risky ones.
  for (const risk of ["normal", "destructive", "bulk", "high-impact"]) {
    const batch = risk === "bulk" ? 10 : 1;
    assert.throws(() => validateActionDeclaration({
      ...clone(), risk, maxBatchSize: batch, preview: { required: false, effectSummary: "x" }
    }), CapabilityContractError, `${risk} was allowed to skip preview`);
    validateActionDeclaration({ ...clone(), risk, maxBatchSize: batch, preview: { required: true, effectSummary: "x" } });
  }
});

test("risk and batch size cannot contradict each other", () => {
  // A batching action labelled `normal` would escape the recent-reauthentication that
  // bulk and high-impact carry, so the label must match the capability.
  assert.throws(() => validateActionDeclaration({ ...clone(), risk: "bulk", maxBatchSize: 1 }),
    CapabilityContractError, "a bulk action that cannot batch was accepted");
  for (const risk of ["normal", "destructive"]) {
    assert.throws(() => validateActionDeclaration({ ...clone(), risk, maxBatchSize: 1000 }),
      CapabilityContractError, `${risk} was allowed to batch 1000 records`);
  }
  validateActionDeclaration({ ...clone(), risk: "bulk", maxBatchSize: 100 });
  validateActionDeclaration({ ...clone(), risk: "high-impact", maxBatchSize: 50 });
});

test("the idempotency window must outlast the timeout", () => {
  // Otherwise a retry after a timeout presents its key outside the dedup window and the
  // effect commits twice.
  assert.throws(() => validateActionDeclaration({ ...clone(), timeoutMs: 300_000,
    idempotency: { keyRule: "client-supplied", windowSeconds: 1 } }),
    CapabilityContractError, "a window shorter than the timeout was accepted");
  validateActionDeclaration({ ...clone(), timeoutMs: 15_000,
    idempotency: { keyRule: "client-supplied", windowSeconds: 15 } });
});

test("actions may only scope to records, never to code, SQL, network or infrastructure", () => {
  for (const kind of ["code", "script", "eval", "sql", "query", "network", "http", "url", "infrastructure", "shell", "file"]) {
    assert.throws(() => validateActionDeclaration({ ...clone(), scope: [{ kind, value: "x" }] }),
      CapabilityContractError, `scope kind ${kind} was accepted`);
  }
  assert.throws(() => validateActionDeclaration({ ...clone(), scope: [] }), CapabilityContractError);
  validateActionDeclaration({ ...clone(), scope: [{ kind: "record", value: "orders/1" }] });
});

test("action execution is disabled and the package ships no transport", async () => {
  assert.equal(ACTION_EXECUTION_ENABLED, false);
  assert.throws(() => assertExecutionDisabled(), (error: unknown) =>
    error instanceof CapabilityContractError && error.code === CapabilityErrorCode.EXECUTION_DISABLED);
  const sources = await readdir(resolve(root, "src"));
  const forbidden = [/\bfetch\s*\(/, /node:http/, /XMLHttpRequest/, /WebSocket/, /actions\/[^"'`]*\/execute/,
                     /from\s+["']pg["']/, /postgres:\/\//i, /\bdocument\./, /\bwindow\./];
  for (const name of sources) {
    const source = await readFile(resolve(root, "src", name), "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${name} contains transport or DOM access (${String(pattern)})`);
    }
  }
});

test("the validators agree with the schemas on unknown keys, bounds and minimums", () => {
  assert.throws(() => validateActionDeclaration({ ...clone(), extra: 1 }), CapabilityContractError, "unknown action key accepted");
  assert.throws(() => validateCapabilityManifest({ ...manifest, extra: 1 }), CapabilityContractError, "unknown manifest key accepted");
  for (const version of [{ major: 0, minor: 0 }, { major: 1, minor: -1 }]) {
    assert.throws(() => validateActionDeclaration({ ...clone(), version }), CapabilityContractError, `action accepted ${JSON.stringify(version)}`);
    assert.throws(() => validateCapabilityManifest({ ...manifest, contractVersion: version }), CapabilityContractError, `manifest accepted ${JSON.stringify(version)}`);
  }
  assert.throws(() => validateActionDeclaration({ ...clone(), scope: [{ kind: "resource", value: "" }] }),
    CapabilityContractError, "empty scope value accepted");
  assert.throws(() => validateCapabilityManifest({ ...manifest, relationships: [], resources: [{ name: "", fields: [] }] }),
    CapabilityContractError, "empty resource name accepted");
});

test("published schemas mirror the validators", async () => {
  const action = JSON.parse(await readFile(resolve(root, "schemas/action-declaration.schema.json"), "utf8"));
  assert.deepEqual([...action.required].sort(), Object.keys(declaration).sort());
  const manifestSchema = JSON.parse(await readFile(resolve(root, "schemas/capability-manifest.schema.json"), "utf8"));
  assert.deepEqual([...manifestSchema.required].sort(), [...MANIFEST_KEYS].sort());
  const errorSchema = JSON.parse(await readFile(resolve(root, "schemas/capability-error.schema.json"), "utf8"));
  assert.deepEqual([...errorSchema.properties.code.enum].sort(), Object.values(CapabilityErrorCode).sort());
});
