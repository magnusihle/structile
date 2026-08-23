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
    validateActionDeclaration({ ...clone(), risk, preview: { required: true, effectSummary: "x" } });
  }
  assert.throws(() => validateActionDeclaration({ ...clone(), risk: "trivial" }), CapabilityContractError);
  assert.throws(() => validateActionDeclaration({ ...clone(), mode: "fire-and-forget" }), CapabilityContractError);
  assert.throws(() => validateActionDeclaration({ ...clone(), maxBatchSize: 0 }), CapabilityContractError);
  assert.throws(() => validateActionDeclaration({ ...clone(), maxBatchSize: 99999 }), CapabilityContractError);
  assert.throws(() => validateActionDeclaration({ ...clone(), timeoutMs: 999999 }), CapabilityContractError);
  assert.throws(() => validateActionDeclaration({ ...clone(), retry: { classification: "maybe" } }), CapabilityContractError);
});

test("a risky action cannot opt out of preview", () => {
  assert.throws(() => validateActionDeclaration({
    ...clone(), risk: "high-impact", preview: { required: false, effectSummary: "x" }
  }), CapabilityContractError);
  validateActionDeclaration({ ...clone(), risk: "normal", preview: { required: false, effectSummary: "x" } });
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

test("published schemas mirror the validators", async () => {
  const action = JSON.parse(await readFile(resolve(root, "schemas/action-declaration.schema.json"), "utf8"));
  assert.deepEqual([...action.required].sort(), Object.keys(declaration).sort());
  const manifestSchema = JSON.parse(await readFile(resolve(root, "schemas/capability-manifest.schema.json"), "utf8"));
  assert.deepEqual([...manifestSchema.required].sort(), [...MANIFEST_KEYS].sort());
  const errorSchema = JSON.parse(await readFile(resolve(root, "schemas/capability-error.schema.json"), "utf8"));
  assert.deepEqual([...errorSchema.properties.code.enum].sort(), Object.values(CapabilityErrorCode).sort());
});
