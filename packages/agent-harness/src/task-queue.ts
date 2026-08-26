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

/**
 * Persistent PostgreSQL task queue. lease() claims the oldest available task
 * with `FOR UPDATE SKIP LOCKED` so concurrent leasers never contend for, or
 * double-claim, the same row. Lease expiry is computed from the database
 * clock (`now() + interval`), never the caller's wall clock, so a leased but
 * never-acked task (crash, dropped process) becomes leasable again -- with
 * attempts incremented -- once its lease expires. An acked task's status is
 * a terminal write and is never selected by lease() again.
 */
export class PostgresTaskQueue {
  constructor(private readonly pool: Pool) {}

  static fromConfig(config: PostgresConnectionConfig): PostgresTaskQueue {
    return new PostgresTaskQueue(new Pool(config));
  }

  async bootstrap(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${QUEUE_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        workflow_id TEXT,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'enqueued',
        attempts INTEGER NOT NULL DEFAULT 0,
        lease_expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async enqueue(payload: unknown, workflowId: string | null = null): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO ${QUEUE_TABLE} (workflow_id, payload, status) VALUES ($1, $2, 'enqueued') RETURNING id`,
        [workflowId, JSON.stringify(payload)]
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
   * Atomically claims the oldest task that is either still `enqueued` or
   * `leased` with an expired lease, using `FOR UPDATE SKIP LOCKED` so two
   * concurrent callers racing this query never receive the same row --
   * neither blocks on the other's in-flight transaction, it simply skips
   * whatever the other has already locked. Returns null when nothing is
   * available to lease.
   */
  async lease(leaseSeconds: number): Promise<QueuedTask | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{
        id: number;
        workflow_id: string | null;
        payload: unknown;
        attempts: number;
      }>(
        `SELECT id, workflow_id, payload, attempts FROM ${QUEUE_TABLE}
         WHERE status = 'enqueued' OR (status = 'leased' AND lease_expires_at < now())
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`
      );
      const row = rows[0];
      if (row === undefined) {
        await client.query("COMMIT");
        return null;
      }
      // `status` on the right-hand side of SET still reads the pre-update
      // row, so attempts only increments when this row was already
      // 'leased' (an expired-lease reclaim), not on a first-time lease.
      const { rows: updated } = await client.query<{ attempts: number }>(
        `UPDATE ${QUEUE_TABLE}
         SET status = 'leased',
             lease_expires_at = now() + ($2 || ' seconds')::interval,
             attempts = CASE WHEN status = 'leased' THEN attempts + 1 ELSE attempts END
         WHERE id = $1
         RETURNING attempts`,
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

  /** Marks a leased task done. Acked tasks are never selected by lease() again. */
  async ack(taskId: number): Promise<void> {
    await this.pool.query(`UPDATE ${QUEUE_TABLE} SET status = 'acked' WHERE id = $1`, [taskId]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
