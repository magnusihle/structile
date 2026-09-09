import test from "node:test";
import assert from "node:assert/strict";
import {
  assertEdgeUsable,
  evaluateGraphifyIndex,
  GRAPHIFY_EDGE_KINDS,
  GRAPHIFY_EXTRACTOR_VERSION,
  GraphifyPolicyError
} from "../dist/index.js";

const REPOSITORY = "https://github.com/magnusihle/structile";
const COMMIT = "a".repeat(40);
const BINDING = { repository: REPOSITORY, commitSha: COMMIT };

const index = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  repository: REPOSITORY,
  commitSha: COMMIT,
  extractorVersion: GRAPHIFY_EXTRACTOR_VERSION,
  contentHash: `sha256:${"b".repeat(64)}`,
  edges: [],
  ...overrides
});

const RESOLVED = { from: "packages/spec", to: "packages/catalog", kind: "RESOLVED", sourceRef: "src/validation.ts:1" };

/** Every negative below is paired with this control, so a rejection is attributable to the defect. */
function assertControlAccepted(): void {
  assert.equal(evaluateGraphifyIndex(index(), BINDING).usable, true, "control index must be usable");
}

/**
 * Captures the refusal so its violation can be asserted. assert.throws() returns undefined, so
 * it can prove *that* something threw but never *why* -- and "why" is the whole contract here.
 */
function refusal(invoke: () => void): GraphifyPolicyError {
  try {
    invoke();
  } catch (error) {
    assert.ok(error instanceof GraphifyPolicyError, `expected GraphifyPolicyError, received ${String(error)}`);
    return error;
  }
  return assert.fail("input was accepted but policy must refuse it");
}

test("an index bound to the exact commit under review is usable context, and never evidence", () => {
  const verdict = evaluateGraphifyIndex(index(), BINDING);
  assert.equal(verdict.usable, true);
  assert.equal(verdict.evidence, false);
  assert.equal(verdict.reason, undefined, "a usable index records no ignore reason");
  assert.ok(Object.isFrozen(verdict), "a verdict is a detached, frozen result");
});

test("an index bound to a different commit, repository or extractor is ignored with a reason", () => {
  for (const [label, stale] of [
    ["commit", index({ commitSha: "0".repeat(40) })],
    ["repository", index({ repository: "https://github.com/magnusihle/other" })],
    ["extractor", index({ extractorVersion: `${GRAPHIFY_EXTRACTOR_VERSION}-old` })]
  ] as Array<[string, Record<string, unknown>]>) {
    assertControlAccepted();
    const verdict = evaluateGraphifyIndex(stale, BINDING);
    assert.equal(verdict.usable, false, `a stale index (${label}) must be ignored`);
    assert.equal(verdict.evidence, false);
    assert.ok(String(verdict.reason ?? "").length > 0, `ignoring for ${label} must record why`);
  }
});

test("an index whose content hash cannot be verified is ignored, whatever shape it takes", () => {
  for (const [label, contentHash] of [
    ["absent", undefined],
    ["malformed", "not-a-hash"],
    ["wrong-algorithm", `md5:${"a".repeat(32)}`],
    ["empty", ""],
    ["uppercase-hex", `sha256:${"A".repeat(64)}`],
    ["short", `sha256:${"a".repeat(63)}`],
    ["non-string", 42]
  ] as Array<[string, unknown]>) {
    assertControlAccepted();
    const verdict = evaluateGraphifyIndex(index({ contentHash }), BINDING);
    assert.equal(verdict.usable, false, `a ${label} content hash must be ignored`);
    assert.ok(String(verdict.reason ?? "").length > 0, `ignoring a ${label} content hash must record why`);
  }
});

test("a missing or malformed index degrades to no context, never to a thrown error", () => {
  for (const absent of [undefined, null, "index", 42, [], () => index()]) {
    const verdict = evaluateGraphifyIndex(absent, BINDING);
    assert.equal(verdict.usable, false);
    assert.equal(verdict.evidence, false);
    assert.ok(String(verdict.reason ?? "").length > 0);
  }
});

test("edges must be a list; a well-formed index with a non-list edges field is ignored", () => {
  for (const edges of [undefined, null, "edges", {}]) {
    assertControlAccepted();
    assert.equal(evaluateGraphifyIndex(index({ edges }), BINDING).usable, false);
  }
});

test("no index state whatsoever is reported as evidence", () => {
  const states = [index(), index({ commitSha: "0".repeat(40) }), index({ contentHash: "" }), undefined, null];
  for (const state of states) {
    assert.equal(evaluateGraphifyIndex(state, BINDING).evidence, false);
  }
});

test("a RESOLVED edge carrying a source reference is accepted", () => {
  assert.doesNotThrow(() => { assertEdgeUsable(RESOLVED); });
});

test("an edge that cannot justify a decision is refused with GraphifyPolicyError, never a TypeError", () => {
  for (const [violation, edge] of [
    ["inferred-edge", { ...RESOLVED, kind: "INFERRED" }],
    ["inferred-edge", { from: "a", to: "b", kind: "INFERRED" }],
    ["inferred-edge", { from: "a", to: "b", kind: "INFERRED", sourceRef: "" }],
    ["inferred-edge", { from: "a", to: "b", kind: "INFERRED", sourceRef: "src/x.ts:1" }],
    ["edge-unknown-kind", { ...RESOLVED, kind: "GUESSED" }],
    ["edge-unknown-kind", { ...RESOLVED, kind: "resolved" }],
    ["edge-unknown-kind", { ...RESOLVED, kind: 1 }],
    ["edge-missing-source-ref", { from: "a", to: "b", kind: "RESOLVED" }],
    ["edge-missing-source-ref", { ...RESOLVED, sourceRef: "   " }],
    ["edge-endpoints", { ...RESOLVED, from: "" }],
    ["edge-endpoints", { ...RESOLVED, to: 7 }],
    ["edge-not-an-object", "packages/spec"],
    ["edge-not-an-object", null],
    ["edge-not-an-object", 42],
    ["edge-not-an-object", ["packages/spec"]]
  ] as Array<[string, unknown]>) {
    // Paired control: the un-poisoned edge is accepted, so the refusal is attributable.
    assert.doesNotThrow(() => { assertEdgeUsable(RESOLVED); });
    const error = refusal(() => { assertEdgeUsable(edge); });
    assert.equal(error.name, "GraphifyPolicyError", "the conformance oracle matches on error name");
    assert.equal(error.violation, violation, `${JSON.stringify(edge)} must be refused as ${violation}`);
    assert.ok(error.message.length > 0);
  }
});

test("an INFERRED edge is refused even when it carries a source reference", () => {
  // The requirement is that inferred edges are *verified against source before use*, which
  // means re-recording the edge as RESOLVED -- not attaching a reference and staying INFERRED.
  assert.throws(() => { assertEdgeUsable({ ...RESOLVED, kind: "INFERRED" }); }, GraphifyPolicyError);
  assert.doesNotThrow(() => { assertEdgeUsable({ ...RESOLVED, kind: "RESOLVED" }); });
});

test("the declared edge-kind list is frozen and is exactly what the policy accepts", () => {
  assert.ok(Object.isFrozen(GRAPHIFY_EDGE_KINDS));
  assert.deepEqual([...GRAPHIFY_EDGE_KINDS], ["RESOLVED", "INFERRED"]);
  for (const kind of GRAPHIFY_EDGE_KINDS) {
    const edge = { ...RESOLVED, kind };
    if (kind === "RESOLVED") assert.doesNotThrow(() => { assertEdgeUsable(edge); });
    else assert.throws(() => { assertEdgeUsable(edge); }, GraphifyPolicyError);
  }
});
