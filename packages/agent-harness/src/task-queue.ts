import { Pool } from "pg";
import type { PostgresConnectionConfig } from "./checkpointer.js";

const QUEUE_TABLE = "agent_harness_task_queue";

export type TaskStatus = "enqueued" | "leased" | "acked";

export interface QueuedTask {
  readonly id: number;
  readonly workflowId: string | null;
  readonly payload: unknown;
  readonly status: TaskStatus;
  readonly attempts: number;
}

export type AckFailureReason = "reclaimed" | "already-acked" | "unknown-task";

/** ack() lost its fencing race: see PostgresTaskQueue#ack for what each reason means. */
export class TaskQueueAckError extends Error {
  readonly taskId: number;
  readonly reason: AckFailureReason;
  readonly currentStatus: TaskStatus | null;
  readonly currentAttempts: number | null;

  constructor(taskId: number, reason: AckFailureReason, currentStatus: TaskStatus | null, currentAttempts: number | null) {
    super(`ack(${taskId}) failed: ${reason} (status=${currentStatus ?? "n/a"}, attempts=${currentAttempts ?? "n/a"})`);
    this.name = "TaskQueueAckError";
    this.taskId = taskId;
    this.reason = reason;
    this.currentStatus = currentStatus;
    this.currentAttempts = currentAttempts;
  }
}

/**
 * Persistent PostgreSQL task queue. See #lease for the SKIP LOCKED claim
 * and DB-clock expiry, and #ack for the attempts-fencing on the final
 * status write.
 */
export class PostgresTaskQueue {
  constructor(private readonly pool: Pool) {}

  static fromConfig(config: PostgresConnectionConfig): PostgresTaskQueue {
    return new PostgresTaskQueue(new Pool(config));
  }

  async bootstrap(): Promise<void> {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS ${QUEUE_TABLE} (
        id BIGSERIAL PRIMARY KEY, workflow_id TEXT, payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'enqueued', attempts INTEGER NOT NULL DEFAULT 0,
        lease_expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`
    );
  }

  async enqueue(payload: unknown, workflowId: string | null = null): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO ${QUEUE_TABLE} (workflow_id, payload, status) VALUES ($1, $2, 'enqueued') RETURNING id`, [workflowId, JSON.stringify(payload)]
      );
      await client.query("COMMIT");
      return rows[0]!.id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Atomically claims the oldest enqueued-or-expired-lease task via
   * `SELECT ... FOR UPDATE SKIP LOCKED`: concurrent callers never block on,
   * or receive, the same row. Expiry is `now() + leaseSeconds` (database
   * clock, never the caller's wall clock). Returns null when nothing is
   * available.
   */
  async lease(leaseSeconds: number): Promise<QueuedTask | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: number; workflow_id: string | null; payload: unknown; attempts: number }>(
        `SELECT id, workflow_id, payload, attempts FROM ${QUEUE_TABLE}
         WHERE status = 'enqueued' OR (status = 'leased' AND lease_expires_at < now())
         ORDER BY created_at ASC, id ASC FOR UPDATE SKIP LOCKED LIMIT 1`
      );
      const row = rows[0];
      if (row === undefined) {
        await client.query("COMMIT");
        return null;
      }
      // SET's `status` reads the pre-update row: attempts increments only on a reclaim, not a first-time lease.
      const { rows: updated } = await client.query<{ attempts: number }>(
        `UPDATE ${QUEUE_TABLE} SET status = 'leased', lease_expires_at = now() + ($2 || ' seconds')::interval,
         attempts = CASE WHEN status = 'leased' THEN attempts + 1 ELSE attempts END WHERE id = $1 RETURNING attempts`,
        [row.id, String(leaseSeconds)]
      );
      await client.query("COMMIT");
      return {
        id: row.id,
        workflowId: row.workflow_id,
        payload: row.payload,
        status: "leased",
        attempts: updated[0]!.attempts
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Marks a leased task done, fenced by the `attempts` token lease() handed
   * the caller: the write lands only while the row is still 'leased' with
   * that exact value, so a holder whose lease was reclaimed (attempts
   * bumped) can never finalize a task it no longer holds -- it throws
   * TaskQueueAckError("reclaimed") instead of silently no-opping, same as
   * ack on an unleased or already-acked row. This fences only the terminal
   * write: at-least-once *processing* is inherent to lease queues and
   * needs HAR-010's idempotency ledger as the compensating control.
   */
  async ack(taskId: number, attempts: number): Promise<void> {
    const result = await this.pool.query(
      `UPDATE ${QUEUE_TABLE} SET status = 'acked' WHERE id = $1 AND status = 'leased' AND attempts = $2`,
      [taskId, attempts]
    );
    if (result.rowCount) return;
    const { rows } = await this.pool.query<{ status: TaskStatus; attempts: number }>(
      `SELECT status, attempts FROM ${QUEUE_TABLE} WHERE id = $1`, [taskId]
    );
    const row = rows[0];
    if (row === undefined) throw new TaskQueueAckError(taskId, "unknown-task", null, null);
    throw new TaskQueueAckError(taskId, row.status === "acked" ? "already-acked" : "reclaimed", row.status, row.attempts);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
