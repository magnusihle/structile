import { Pool } from "pg";
import type { Checkpointer, PostgresConnectionConfig, WorkflowCheckpoint } from "./checkpointer.js";

const INTERRUPT_TABLE = "agent_harness_interrupts";

export type InterruptResolutionStatus = "approved" | "denied";
export type InterruptStatus = "pending" | InterruptResolutionStatus;

export interface WorkflowInterrupt {
  readonly id: string;
  readonly workflowId: string;
  readonly node: string;
  readonly payload: unknown;
  readonly status: InterruptStatus;
  readonly requestedAt: string;
  readonly resolvedAt: string | null;
  readonly resolution: unknown | null;
}

/** A workflow already has a pending interrupt; a second concurrent request is ambiguous. */
export class InterruptAlreadyPendingError extends Error {
  constructor(readonly workflowId: string, readonly pending: WorkflowInterrupt) {
    super(`workflow ${workflowId} already has a pending interrupt (${pending.id})`);
    this.name = "InterruptAlreadyPendingError";
  }
}

/** resolve() targeted a non-pending interrupt; carries its true current state, not just its status. */
export class InterruptNotPendingError extends Error {
  constructor(readonly current: WorkflowInterrupt) {
    super(`interrupt ${current.id} is not pending (actual status: ${current.status})`);
    this.name = "InterruptNotPendingError";
  }
}

interface InterruptRow {
  readonly id: string | number; readonly workflow_id: string; readonly node: string;
  readonly payload: unknown; readonly status: InterruptStatus; readonly requested_at: Date;
  readonly resolved_at: Date | null; readonly resolution: unknown | null;
}

function toInterrupt(row: InterruptRow): WorkflowInterrupt {
  return {
    id: String(row.id),
    workflowId: row.workflow_id,
    node: row.node,
    payload: row.payload,
    status: row.status,
    requestedAt: row.requested_at.toISOString(),
    resolvedAt: row.resolved_at === null ? null : row.resolved_at.toISOString(),
    resolution: row.resolution
  };
}

/** Persists human-in-the-loop interrupt requests so an approval/denial arriving arbitrarily
 * later (HARD-001 simulates 24h) resumes with equivalent evidence; nothing here depends on
 * elapsed wall-clock time, only on `status`. */
export class InterruptStore {
  constructor(private readonly pool: Pool) {}
  static fromConfig(config: PostgresConnectionConfig): InterruptStore {
    return new InterruptStore(new Pool(config));
  }

  async bootstrap(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${INTERRUPT_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        node TEXT NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
        requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ,
        resolution JSONB
      )
    `);
  }

  /** Throws InterruptAlreadyPendingError if this workflow already has an unresolved interrupt. */
  async requestInterrupt(workflowId: string, node: string, payload: unknown): Promise<WorkflowInterrupt> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Same technique as PostgresCheckpointer.saveCheckpoint: serializes the check-then-insert below.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [workflowId]);
      const { rows: pending } = await client.query<InterruptRow>(
        `SELECT * FROM ${INTERRUPT_TABLE} WHERE workflow_id = $1 AND status = 'pending'`,
        [workflowId]
      );
      if (pending[0] !== undefined) throw new InterruptAlreadyPendingError(workflowId, toInterrupt(pending[0]));
      const { rows } = await client.query<InterruptRow>(
        `INSERT INTO ${INTERRUPT_TABLE} (workflow_id, node, payload) VALUES ($1, $2, $3) RETURNING *`,
        [workflowId, node, JSON.stringify(payload)]
      );
      await client.query("COMMIT");
      return toInterrupt(rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Fenced by `status = 'pending'` in the WHERE clause, checked by whether a row came
   * back: resolving twice throws InterruptNotPendingError instead of overwriting. */
  async resolve(interruptId: string, status: InterruptResolutionStatus, resolution: unknown): Promise<WorkflowInterrupt> {
    const { rows } = await this.pool.query<InterruptRow>(
      `UPDATE ${INTERRUPT_TABLE} SET status = $2, resolved_at = now(), resolution = $3
       WHERE id = $1::bigint AND status = 'pending' RETURNING *`,
      [interruptId, status, JSON.stringify(resolution)]
    );
    if (rows[0] !== undefined) return toInterrupt(rows[0]);
    const { rows: current } = await this.pool.query<InterruptRow>(`SELECT * FROM ${INTERRUPT_TABLE} WHERE id = $1::bigint`, [interruptId]);
    if (current[0] === undefined) throw new Error(`interrupt ${interruptId} not found`);
    throw new InterruptNotPendingError(toInterrupt(current[0]));
  }

  /** Most recent interrupt for a workflow, any status. Ordered by id, never requested_at —
   * the same never-wall-clock-time discipline PostgresCheckpointer uses for "latest". */
  async latestForWorkflow(workflowId: string): Promise<WorkflowInterrupt | null> {
    const { rows } = await this.pool.query<InterruptRow>(
      `SELECT * FROM ${INTERRUPT_TABLE} WHERE workflow_id = $1 ORDER BY id DESC LIMIT 1`,
      [workflowId]
    );
    return rows[0] === undefined ? null : toInterrupt(rows[0]);
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Where a workflow stands: its latest checkpoint, if any, plus its most recent interrupt
 * (any status). Read-only — the caller decides whether to replay from `checkpoint` and
 * whether `interrupt` already carries a `resolution` to carry forward. */
export type ResumePoint =
  | { readonly kind: "fresh-start"; readonly workflowId: string }
  | {
      readonly kind: "resume";
      readonly workflowId: string;
      readonly checkpoint: WorkflowCheckpoint;
      readonly interrupt: WorkflowInterrupt | null;
    };

/** Resolves the resume point after a process/host kill: a pure read of the checkpointer's
 * and interrupt store's latest rows for the same workflow. Never marks an interrupt
 * "consumed" — a caller that already acted on a resolution recognizes that from its own
 * checkpoint outdating the interrupt's resolvedAt (same DB clock for both), avoiding a
 * second, driftable "acknowledged" flag here. */
export class WorkflowResumer {
  constructor(private readonly checkpointer: Checkpointer, private readonly interrupts: InterruptStore) {}

  async resume(workflowId: string): Promise<ResumePoint> {
    const checkpoint = await this.checkpointer.loadLatest(workflowId);
    if (checkpoint === null) return { kind: "fresh-start", workflowId };
    const interrupt = await this.interrupts.latestForWorkflow(workflowId);
    return { kind: "resume", workflowId, checkpoint, interrupt };
  }
}
