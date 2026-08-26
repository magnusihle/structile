import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  PostgresCheckpointer,
  InterruptStore,
  InterruptAlreadyPendingError,
  InterruptNotPendingError,
  WorkflowResumer,
  readPostgresConnectionConfig,
  type ResumePoint
} from "../dist/index.js";

// Live-postgres-only; see checkpointer.test.ts for the full skip-idiom rationale.
const skip = process.env.STRUCTILE_POSTGRES_PASSWORD_FILE
  ? false
  : "STRUCTILE_POSTGRES_PASSWORD_FILE not set; bring up postgres per the task contract's compose step first";

async function freshInterruptStore(): Promise<InterruptStore> {
  const store = InterruptStore.fromConfig(readPostgresConnectionConfig());
  await store.bootstrap();
  return store;
}

async function freshResumer() {
  const config = readPostgresConnectionConfig();
  const checkpointer = PostgresCheckpointer.fromConfig(config);
  const interrupts = InterruptStore.fromConfig(config);
  await checkpointer.bootstrap();
  await interrupts.bootstrap();
  return { resumer: new WorkflowResumer(checkpointer, interrupts), checkpointer, interrupts };
}

/** Narrows a ResumePoint to its "resume" branch, failing the test with a clear message if not. */
function asResume(point: ResumePoint): Extract<ResumePoint, { kind: "resume" }> {
  assert.equal(point.kind, "resume");
  return point as Extract<ResumePoint, { kind: "resume" }>;
}

test("a pending interrupt survives a destroyed pool, and resolving it records the resolution", { skip }, async () => {
  const workflowId = `workflow:${randomUUID()}`;
  const writer = await freshInterruptStore();
  const requested = await writer.requestInterrupt(workflowId, "review", { question: "approve deploy?" });
  await writer.close();
  const reader = await freshInterruptStore();
  try {
    const latest = await reader.latestForWorkflow(workflowId);
    assert.equal(latest?.id, requested.id);
    assert.equal(latest?.status, "pending");
    assert.deepEqual(latest?.payload, { question: "approve deploy?" });
    const resolved = await reader.resolve(requested.id, "approved", { approver: "human" });
    assert.equal(resolved.status, "approved");
    assert.deepEqual(resolved.resolution, { approver: "human" });
    assert.ok(resolved.resolvedAt);
  } finally {
    await reader.close();
  }
});
test("only one pending interrupt is allowed per workflow at a time", { skip }, async (t) => {
  const store = await freshInterruptStore();
  t.after(() => store.close());
  const workflowId = `workflow:${randomUUID()}`;
  await store.requestInterrupt(workflowId, "review", { question: "first" });
  await assert.rejects(
    () => store.requestInterrupt(workflowId, "review", { question: "second" }),
    InterruptAlreadyPendingError
  );
});
test("resolving a non-pending interrupt fails closed and reports the true current state", { skip }, async (t) => {
  const store = await freshInterruptStore();
  t.after(() => store.close());
  const workflowId = `workflow:${randomUUID()}`;
  const requested = await store.requestInterrupt(workflowId, "review", { question: "approve?" });
  await store.resolve(requested.id, "denied", { reason: "not yet" });
  await assert.rejects(() => store.resolve(requested.id, "approved", { reason: "retry" }), (error: unknown) => {
    assert.ok(error instanceof InterruptNotPendingError);
    assert.equal(error.current.status, "denied");
    assert.deepEqual(error.current.resolution, { reason: "not yet" });
    return true;
  });
});
test("interrupts and their pending slots do not leak across workflows", { skip }, async (t) => {
  const store = await freshInterruptStore();
  t.after(() => store.close());
  const workflowA = `workflow:${randomUUID()}`;
  const workflowB = `workflow:${randomUUID()}`;
  await store.requestInterrupt(workflowA, "review", { owner: "a" });
  await store.requestInterrupt(workflowB, "review", { owner: "b" });
  assert.deepEqual((await store.latestForWorkflow(workflowA))?.payload, { owner: "a" });
  assert.deepEqual((await store.latestForWorkflow(workflowB))?.payload, { owner: "b" });
  await assert.rejects(
    () => store.requestInterrupt(workflowA, "review", { owner: "a2" }),
    InterruptAlreadyPendingError
  );
});
test("resumes at the latest checkpoint after the writing pool is destroyed (simulated process kill)", { skip }, async () => {
  const workflowId = `workflow:${randomUUID()}`;
  const writer = await freshResumer();
  await writer.checkpointer.saveCheckpoint(workflowId, "plan", { step: 1 });
  await writer.checkpointer.saveCheckpoint(workflowId, "execute", { step: 2 });
  await writer.checkpointer.close();
  await writer.interrupts.close();
  const reader = await freshResumer();
  try {
    const point = asResume(await reader.resumer.resume(workflowId));
    assert.equal(point.checkpoint.node, "execute");
    assert.equal(point.checkpoint.seq, 2);
    assert.equal(point.interrupt, null);
  } finally {
    await reader.checkpointer.close();
    await reader.interrupts.close();
  }
});
test("a workflow with no checkpoints resumes as a documented fresh start", { skip }, async () => {
  const { resumer, checkpointer, interrupts } = await freshResumer();
  const workflowId = `workflow:${randomUUID()}`;
  try {
    assert.deepEqual(await resumer.resume(workflowId), { kind: "fresh-start", workflowId });
  } finally {
    await checkpointer.close();
    await interrupts.close();
  }
});
test("a resolved interrupt's resolution is carried in the resume point (equivalent evidence for a delayed approval)", { skip }, async () => {
  const workflowId = `workflow:${randomUUID()}`;
  const { resumer, checkpointer, interrupts } = await freshResumer();
  try {
    await checkpointer.saveCheckpoint(workflowId, "await-approval", { step: 1 });
    const requested = await interrupts.requestInterrupt(workflowId, "await-approval", { question: "deploy?" });
    assert.equal(asResume(await resumer.resume(workflowId)).interrupt?.status, "pending");
    const resolution = { approver: "human", note: "resumed after simulated 24h pause" };
    await interrupts.resolve(requested.id, "approved", resolution);
    const point = asResume(await resumer.resume(workflowId));
    assert.equal(point.interrupt?.status, "approved");
    assert.deepEqual(point.interrupt?.resolution, resolution);
  } finally {
    await checkpointer.close();
    await interrupts.close();
  }
});
