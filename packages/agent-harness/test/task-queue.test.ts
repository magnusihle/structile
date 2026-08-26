import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PostgresTaskQueue, readPostgresConnectionConfig } from "../dist/index.js";

// These tests require a live PostgreSQL reachable via the STRUCTILE_POSTGRES_*
// convention (see the task contract's compose step); they never run against
// a mock. Skip, rather than fail, when that infrastructure was not provisioned
// for this run -- matching the existing platform-conditional skip idiom below.
// Unlike that skip, which is conditional and still runs in most CI, this one
// is unconditional in candidate CI: ci.yml provisions no postgres, so this
// file always skips there. These tests run for real locally, via the task
// contract's own compose step, and will gain gate-relevant coverage from the
// protected HARD-001 drill once that lands -- a green candidate CI run does
// not exercise this file.
const skip = process.env.STRUCTILE_POSTGRES_PASSWORD_FILE
  ? false
  : "STRUCTILE_POSTGRES_PASSWORD_FILE not set; bring up postgres per the task contract's compose step first";

// Unlike the checkpointer, lease() claims the oldest available row across
// the *whole* table -- it is not scoped to a workflow_id, by design (a real
// task queue is a single global queue). The test postgres volume persists
// across `node --test` invocations, so leftover rows from an earlier run
// (including a deliberately never-acked crash-safety row) would otherwise
// leak into later tests' lease() results. Reset the table before each test.
test.beforeEach(async () => {
  if (skip) return;
  const pool = new Pool(readPostgresConnectionConfig());
  try {
    await pool.query("DELETE FROM agent_harness_task_queue");
  } catch {
    // First run against a fresh database: the table doesn't exist yet.
    // The test body's freshQueue() call creates it via bootstrap().
  } finally {
    await pool.end();
  }
});

async function freshQueue(): Promise<PostgresTaskQueue> {
  const queue = PostgresTaskQueue.fromConfig(readPostgresConnectionConfig());
  await queue.bootstrap();
  return queue;
}

test("enqueue, lease and ack lifecycle", { skip }, async (t) => {
  const queue = await freshQueue();
  t.after(async () => { await queue.close(); });
  const workflowId = `workflow:${randomUUID()}`;

  const id = await queue.enqueue({ kind: "greet" }, workflowId);
  const leased = await queue.lease(30);
  assert.ok(leased);
  assert.equal(leased?.id, id);
  assert.equal(leased?.workflowId, workflowId);
  assert.deepEqual(leased?.payload, { kind: "greet" });
  assert.equal(leased?.status, "leased");
  assert.equal(leased?.attempts, 0);

  await queue.ack(id);
  assert.equal(await queue.lease(30), null);
});

test("crash safety: an expired, never-acked lease becomes leasable again with attempts incremented", { skip }, async (t) => {
  const workflowId = `workflow:${randomUUID()}`;
  const crashed = await freshQueue();
  const id = await crashed.enqueue({ kind: "durable" }, workflowId);
  const firstLease = await crashed.lease(1);
  assert.ok(firstLease);
  assert.equal(firstLease?.attempts, 0);
  // Simulate a crash: the leaseholder's connection is destroyed without ack.
  await crashed.close();

  // Real wait past the 1s lease -- no clock mocking.
  await new Promise((resolveTimer) => setTimeout(resolveTimer, 1500));

  const survivor = await freshQueue();
  t.after(async () => { await survivor.close(); });
  const relet = await survivor.lease(30);
  assert.ok(relet);
  assert.equal(relet?.id, id);
  assert.equal(relet?.attempts, 1, "expired-lease reclaim increments attempts");
});

test("an acked task is never re-delivered, even after its original lease window would have expired", { skip }, async (t) => {
  const queue = await freshQueue();
  t.after(async () => { await queue.close(); });
  const workflowId = `workflow:${randomUUID()}`;

  const acked = await queue.enqueue({ kind: "first" }, workflowId);
  const other = await queue.enqueue({ kind: "second" }, workflowId);

  const leased = await queue.lease(1);
  assert.equal(leased?.id, acked);
  await queue.ack(acked);

  await new Promise((resolveTimer) => setTimeout(resolveTimer, 1500));

  const next = await queue.lease(30);
  assert.equal(next?.id, other, "the acked task must not be re-delivered even though its lease window has passed");
  assert.equal(await queue.lease(30), null);
});

test("concurrent lease() calls across two pools never return the same task (FOR UPDATE SKIP LOCKED)", { skip }, async (t) => {
  const seeder = await freshQueue();
  const workflowId = `workflow:${randomUUID()}`;
  const taskCount = 20;
  const ids: number[] = [];
  for (let index = 0; index < taskCount; index++) {
    ids.push(await seeder.enqueue({ index }, workflowId));
  }
  await seeder.close();

  const poolA = await freshQueue();
  const poolB = await freshQueue();
  t.after(async () => {
    await poolA.close();
    await poolB.close();
  });

  const leaseOne = async (queue: PostgresTaskQueue) => {
    const results: number[] = [];
    for (let index = 0; index < taskCount; index++) {
      const leased = await queue.lease(60);
      if (leased) results.push(leased.id);
    }
    return results;
  };

  // Interleave two pools racing lease() calls against the same table.
  const [fromA, fromB] = await Promise.all([leaseOne(poolA), leaseOne(poolB)]);
  const delivered = [...fromA, ...fromB];

  assert.equal(delivered.length, taskCount, "every enqueued task must be delivered exactly once across both pools");
  assert.equal(new Set(delivered).size, taskCount, "no task may be delivered to both pools");
  assert.deepEqual([...delivered].sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
});

test("payload survives the jsonb round-trip intact", { skip }, async (t) => {
  const queue = await freshQueue();
  t.after(async () => { await queue.close(); });
  const payload = {
    nested: { array: [1, 2, 3], flag: true, nothing: null },
    unicode: "üñîçødé 🚀",
    number: 42.5
  };

  await queue.enqueue(payload);
  const leased = await queue.lease(30);
  assert.deepEqual(leased?.payload, payload);
});
