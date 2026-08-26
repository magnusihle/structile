import { Pool } from "pg";
import { type PostgresConnectionConfig } from "./checkpointer.js";

/** Exported so tests (and operators doing manual reconciliation) can address the table directly. */
export const IDEMPOTENCY_LEDGER_TABLE = "agent_harness_idempotency_ledger";

/** An operation has been claimed for execution but no outcome has been recorded yet. */
export interface PendingClaim {
  readonly status: "pending";
  readonly operationId: string;
  readonly claimedAt: string;
}

/** An operation's effect ran to completion and its result is durably recorded. */
export interface RecordedOutcome<T = unknown> {
  readonly status: "recorded";
  readonly operationId: string;
  readonly result: T;
  readonly recordedAt: string;
}

export type LedgerEntry<T = unknown> = PendingClaim | RecordedOutcome<T>;

/**
 * Thrown by runOnce when another caller (concurrent, or a prior attempt that never returned --
 * including one killed mid-effect) already holds the claim on this operation id and no outcome
 * is recorded yet. Whether the external effect actually ran is unknown, so runOnce never
 * guesses: it won't re-run the effect or invent a result. Reconcile out of band, e.g. by polling
 * IdempotencyLedger#get(operationId) until it resolves to "recorded".
 */
export class IdempotencyInDoubtError extends Error {
  readonly operationId: string;

  constructor(operationId: string) {
    super(
      `operation ${operationId} is claimed but has no recorded outcome; its external effect may ` +
        `or may not have run. Refusing to re-run it -- reconcile via IdempotencyLedger#get() instead.`
    );
    this.name = "IdempotencyInDoubtError";
    this.operationId = operationId;
  }
}

/**
 * PostgreSQL-persisted idempotency ledger for agent-harness external side effects (branches,
 * comments, pull requests, approvals, ...). runOnce(operationId, effect) claims the operation id
 * atomically in the database *before* the effect runs, so concurrent or replayed callers --
 * including one resuming after the previous process was killed -- can never both execute it.
 *
 * Row lifecycle: (absent) --[claim: INSERT ... ON CONFLICT DO NOTHING]--> pending
 * --[record: UPDATE]--> recorded. Claim and record are each a single atomic statement; no
 * transaction spans the effect itself, since it is an arbitrary external async call and holding
 * a DB transaction open across it would serialize unrelated work behind it. Consequently, a
 * caller that wins the claim but then fails -- effect rejects, throws synchronously, or the
 * process is killed outright -- leaves its row stuck in "pending" forever; runOnce never
 * releases or retries a claim it did not itself just win. That is deliberate: a claimed-but-
 * unrecorded row is exactly the crash-in-doubt case, and the only safe move is to say so
 * (IdempotencyInDoubtError) rather than risk a duplicate effect. Recovering is an out-of-band
 * decision (a human or reconciliation job correcting the row after inspecting the external
 * system) -- runOnce itself never does it.
 */
export class IdempotencyLedger {
  constructor(private readonly pool: Pool) {}

  static fromConfig(config: PostgresConnectionConfig): IdempotencyLedger {
    return new IdempotencyLedger(new Pool(config));
  }

  async bootstrap(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${IDEMPOTENCY_LEDGER_TABLE} (
        operation_id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('pending', 'recorded')),
        result JSONB,
        claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        recorded_at TIMESTAMPTZ
      )
    `);
  }

  /**
   * Runs `effect` at most once for a given operationId, ever, across any number of processes and
   * retries. First caller to claim operationId runs effect(), records its result, and returns
   * it. Any later caller, once that result is recorded, returns it without invoking effect at
   * all. A caller that loses the claim race while the winner's effect is not yet recorded
   * (still running, or the winner died first) throws IdempotencyInDoubtError without invoking
   * effect -- it never blocks waiting for the winner and never re-runs.
   *
   * `result` is serialized with JSON.stringify (same round-trip caveat as
   * PostgresCheckpointer#saveCheckpoint: undefined becomes null, Dates become ISO strings,
   * numbers are JS doubles).
   */
  async runOnce<T>(operationId: string, effect: () => Promise<T>): Promise<T> {
    const claim = await this.pool.query(
      `INSERT INTO ${IDEMPOTENCY_LEDGER_TABLE} (operation_id, status) VALUES ($1, 'pending')
       ON CONFLICT (operation_id) DO NOTHING
       RETURNING operation_id`,
      [operationId]
    );

    if (claim.rowCount === 0) {
      const entry = await this.get<T>(operationId);
      // entry cannot be null here: the INSERT above just proved a row exists for this id, and
      // no code path deletes rows.
      if (entry?.status === "recorded") return entry.result;
      throw new IdempotencyInDoubtError(operationId);
    }

    const result = await effect();
    await this.pool.query(
      `UPDATE ${IDEMPOTENCY_LEDGER_TABLE}
       SET status = 'recorded', result = $2, recorded_at = now()
       WHERE operation_id = $1`,
      [operationId, JSON.stringify(result === undefined ? null : result)]
    );
    return result;
  }

  /** Exposes the recorded (or still-pending) outcome of an operation id so callers can reconcile. */
  async get<T = unknown>(operationId: string): Promise<LedgerEntry<T> | null> {
    const { rows } = await this.pool.query<{
      status: "pending" | "recorded";
      result: T | null;
      claimed_at: Date;
      recorded_at: Date | null;
    }>(
      `SELECT status, result, claimed_at, recorded_at FROM ${IDEMPOTENCY_LEDGER_TABLE} WHERE operation_id = $1`,
      [operationId]
    );
    const row = rows[0];
    if (row === undefined) return null;
    if (row.status === "recorded") {
      return {
        status: "recorded",
        operationId,
        result: row.result as T,
        recordedAt: (row.recorded_at as Date).toISOString()
      };
    }
    return { status: "pending", operationId, claimedAt: row.claimed_at.toISOString() };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
