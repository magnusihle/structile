import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PostgresCheckpointer, readPostgresConnectionConfig } from "../dist/index.js";

// These tests require a live PostgreSQL reachable via the STRUCTILE_POSTGRES_*
// convention (see the task contract's compose step); they never run against
// a mock. Skip, rather than fail, when that infrastructure was not provisioned
// for this run — matching the existing platform-conditional skip idiom below.
// Unlike that skip, which is conditional and still runs in most CI, this one
// is unconditional in candidate CI: ci.yml provisions no postgres, so this
// file always skips there. These tests run for real locally, via the task
// contract's own compose step, and will gain gate-relevant coverage from the
// protected HARD-001 drill once that lands — a green candidate CI run does
// not exercise this file.
const skip = process.env.STRUCTILE_POSTGRES_PASSWORD_FILE
  ? false
  : "STRUCTILE_POSTGRES_PASSWORD_FILE not set; bring up postgres per the task contract's compose step first";

async function freshCheckpointer(): Promise<PostgresCheckpointer> {
  const checkpointer = PostgresCheckpointer.fromConfig(readPostgresConnectionConfig());
  await checkpointer.bootstrap();
  return checkpointer;
}

test("checkpoints append across node boundaries and loadLatest returns the newest", { skip }, async (t) => {
  const checkpointer = await freshCheckpointer();
  t.after(async () => { await checkpointer.close(); });
  const workflowId = `workflow:${randomUUID()}`;

  await checkpointer.saveCheckpoint(workflowId, "plan", { step: 1 });
  await checkpointer.saveCheckpoint(workflowId, "execute", { step: 2 });
  await checkpointer.saveCheckpoint(workflowId, "review", { step: 3 });

  const latest = await checkpointer.loadLatest(workflowId);
  assert.ok(latest);
  assert.equal(latest?.node, "review");
  assert.deepEqual(latest?.state, { step: 3 });
  assert.equal(latest?.seq, 3);
});

test("durability survives a destroyed connection: a brand-new instance loads what an earlier, closed one wrote", { skip }, async () => {
  const workflowId = `workflow:${randomUUID()}`;
  const writer = await freshCheckpointer();
  await writer.saveCheckpoint(workflowId, "plan", { durable: true });
  await writer.close();

  const reader = await freshCheckpointer();
  try {
    const latest = await reader.loadLatest(workflowId);
    assert.ok(latest);
    assert.equal(latest?.node, "plan");
    assert.deepEqual(latest?.state, { durable: true });
  } finally {
    await reader.close();
  }
});

test("two workflows do not see each other's checkpoints", { skip }, async (t) => {
  const checkpointer = await freshCheckpointer();
  t.after(async () => { await checkpointer.close(); });
  const workflowA = `workflow:${randomUUID()}`;
  const workflowB = `workflow:${randomUUID()}`;

  await checkpointer.saveCheckpoint(workflowA, "plan", { owner: "a" });
  await checkpointer.saveCheckpoint(workflowB, "plan", { owner: "b" });
  await checkpointer.saveCheckpoint(workflowB, "execute", { owner: "b", step: 2 });

  const latestA = await checkpointer.loadLatest(workflowA);
  const latestB = await checkpointer.loadLatest(workflowB);
  assert.deepEqual(latestA?.state, { owner: "a" });
  assert.equal(latestA?.seq, 1);
  assert.deepEqual(latestB?.state, { owner: "b", step: 2 });
  assert.equal(latestB?.seq, 2);
});

test("state survives the JSON round-trip intact", { skip }, async (t) => {
  const checkpointer = await freshCheckpointer();
  t.after(async () => { await checkpointer.close(); });
  const workflowId = `workflow:${randomUUID()}`;
  const state = {
    nested: { array: [1, 2, 3], flag: true, nothing: null },
    unicode: "üñîçødé 🚀",
    number: 42.5
  };

  await checkpointer.saveCheckpoint(workflowId, "plan", state);
  const latest = await checkpointer.loadLatest(workflowId);
  assert.deepEqual(latest?.state, state);
});

test("loadLatest returns null for a workflow with no checkpoints", { skip }, async (t) => {
  const checkpointer = await freshCheckpointer();
  t.after(async () => { await checkpointer.close(); });
  assert.equal(await checkpointer.loadLatest(`workflow:${randomUUID()}`), null);
});
