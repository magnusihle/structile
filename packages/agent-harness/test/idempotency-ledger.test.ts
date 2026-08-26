import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  IdempotencyLedger,
  IdempotencyInDoubtError,
  IDEMPOTENCY_LEDGER_TABLE,
  readPostgresConnectionConfig
} from "../dist/index.js";

// Same convention as checkpointer.test.ts: requires a live PostgreSQL via the STRUCTILE_POSTGRES_*
// convention (task contract's compose step); never runs against a mock. Skip, rather than fail,
// when that infrastructure wasn't provisioned. ci.yml provisions no postgres, so this file always
// skips there -- a green candidate CI run does not exercise it.
const skip = process.env.STRUCTILE_POSTGRES_PASSWORD_FILE
  ? false
  : "STRUCTILE_POSTGRES_PASSWORD_FILE not set; bring up postgres per the task contract's compose step first";

async function freshLedger(): Promise<IdempotencyLedger> {
  const ledger = IdempotencyLedger.fromConfig(readPostgresConnectionConfig());
  await ledger.bootstrap();
  return ledger;
}

test("first runOnce executes and records; a second call with the same id does not re-execute", { skip }, async (t) => {
  const ledger = await freshLedger();
  t.after(async () => { await ledger.close(); });
  const operationId = `op:${randomUUID()}`;
  let invocations = 0;
  const effect = async () => {
    invocations += 1;
    return { branch: "feature/x", invocation: invocations };
  };

  const first = await ledger.runOnce(operationId, effect);
  const second = await ledger.runOnce(operationId, effect);

  assert.equal(invocations, 1, "effect must run exactly once");
  assert.deepEqual(first, { branch: "feature/x", invocation: 1 });
  assert.deepEqual(second, { branch: "feature/x", invocation: 1 }, "second call returns the recorded result, not a fresh invocation");

  const entry = await ledger.get(operationId);
  assert.equal(entry?.status, "recorded");
});

test("process-death replay: a fresh Pool with the same operation id does not re-run the effect", { skip }, async () => {
  const operationId = `op:${randomUUID()}`;
  const writer = await freshLedger();
  let invocations = 0;
  const result = await writer.runOnce(operationId, async () => {
    invocations += 1;
    return { comment: "posted" };
  });
  await writer.close(); // simulates the process (and its Pool) going away after a successful effect

  const resumed = await freshLedger();
  try {
    const replayed = await resumed.runOnce(operationId, async () => {
      invocations += 1;
      return { comment: "should-not-happen" };
    });
    assert.equal(invocations, 1, "effect must not be re-run by the resumed process");
    assert.deepEqual(replayed, result);
  } finally {
    await resumed.close();
  }
});

test("concurrency: two pools racing runOnce on the same id run the effect exactly once total", { skip }, async () => {
  const operationId = `op:${randomUUID()}`;
  const poolA = await freshLedger();
  const poolB = await freshLedger();
  let invocations = 0;
  const effect = async () => {
    invocations += 1;
    // Hold the "external effect" open briefly so both callers are genuinely in flight together.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { pr: 42 };
  };

  try {
    const outcomes = await Promise.allSettled([poolA.runOnce(operationId, effect), poolB.runOnce(operationId, effect)]);
    assert.equal(invocations, 1, "the effect executes exactly once total across the race");

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one caller wins the claim and returns the result");
    assert.equal(rejected.length, 1, "exactly one caller loses the race");
    assert.deepEqual((fulfilled[0] as PromiseFulfilledResult<unknown>).value, { pr: 42 });
    assert.ok((rejected[0] as PromiseRejectedResult).reason instanceof IdempotencyInDoubtError);

    const entry = await poolA.get(operationId); // the loser can reconcile after the fact via get()
    assert.equal(entry?.status, "recorded");
  } finally {
    await poolA.close();
    await poolB.close();
  }
});

test("crash-in-window: a claim with no recorded outcome yields the documented in-doubt semantics", { skip }, async () => {
  const operationId = `op:${randomUUID()}`;

  // Simulate a process that claimed the operation and was killed before it could record an
  // outcome -- i.e. exactly the row shape runOnce's own claim step produces, written directly so
  // no effect ever actually ran.
  const rawPool = new Pool(readPostgresConnectionConfig());
  const bootstrapLedger = await freshLedger();
  await bootstrapLedger.close();
  await rawPool.query(
    `INSERT INTO ${IDEMPOTENCY_LEDGER_TABLE} (operation_id, status) VALUES ($1, 'pending')`,
    [operationId]
  );
  await rawPool.end(); // the "crashed process"'s connection is gone

  const resumed = await freshLedger();
  try {
    const entry = await resumed.get(operationId);
    assert.equal(entry?.status, "pending", "get() reports the stuck claim rather than nothing");

    let invocations = 0;
    await assert.rejects(
      () => resumed.runOnce(operationId, async () => { invocations += 1; return "should-not-run"; }),
      IdempotencyInDoubtError
    );
    assert.equal(invocations, 0, "runOnce never invokes the effect for a claimed-but-unrecorded operation");
  } finally {
    await resumed.close();
  }
});

test("distinct operation ids run independently", { skip }, async (t) => {
  const ledger = await freshLedger();
  t.after(async () => { await ledger.close(); });
  const operationIdA = `op:${randomUUID()}`;
  const operationIdB = `op:${randomUUID()}`;
  let invocationsA = 0;
  let invocationsB = 0;

  const resultA = await ledger.runOnce(operationIdA, async () => { invocationsA += 1; return "a"; });
  const resultB = await ledger.runOnce(operationIdB, async () => { invocationsB += 1; return "b"; });
  await ledger.runOnce(operationIdA, async () => { invocationsA += 1; return "a-again"; });
  await ledger.runOnce(operationIdB, async () => { invocationsB += 1; return "b-again"; });

  assert.equal(invocationsA, 1);
  assert.equal(invocationsB, 1);
  assert.equal(resultA, "a");
  assert.equal(resultB, "b");
});
