import { readFileSync } from "node:fs";
import { Pool } from "pg";

const CHECKPOINT_TABLE = "agent_harness_checkpoints";

export interface WorkflowCheckpoint {
  readonly seq: number;
  readonly node: string;
  readonly state: unknown;
  readonly createdAt: string;
}

/** Minimal hook so harness workflow code can persist state at a node boundary. */
export interface Checkpointer {
  saveCheckpoint(workflowId: string, node: string, state: unknown): Promise<void>;
  loadLatest(workflowId: string): Promise<WorkflowCheckpoint | null>;
}

export interface PostgresConnectionConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly database: string;
  readonly password: string;
}

/** Reads the STRUCTILE_POSTGRES_* convention already established for apps/foundation-health. */
export function readPostgresConnectionConfig(environment: NodeJS.ProcessEnv = process.env): PostgresConnectionConfig {
  const passwordFile = environment.STRUCTILE_POSTGRES_PASSWORD_FILE;
  if (!passwordFile) throw new Error("STRUCTILE_POSTGRES_PASSWORD_FILE is required");
  return {
    host: environment.STRUCTILE_POSTGRES_HOST ?? "postgres",
    port: Number(environment.STRUCTILE_POSTGRES_PORT ?? "5432"),
    user: environment.STRUCTILE_POSTGRES_USER ?? "structile",
    database: environment.STRUCTILE_POSTGRES_DB ?? "structile",
    password: readFileSync(passwordFile, "utf8").trim()
  };
}

/**
 * Append-only PostgreSQL checkpointer. Each saved checkpoint gets the next
 * sequence number for its workflow, computed inside the database under an
 * advisory transaction lock; "latest" is always the row with the greatest
 * seq for that workflow_id, never wall-clock time.
 */
export class PostgresCheckpointer implements Checkpointer {
  constructor(private readonly pool: Pool) {}

  static fromConfig(config: PostgresConnectionConfig): PostgresCheckpointer {
    return new PostgresCheckpointer(new Pool(config));
  }

  async bootstrap(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${CHECKPOINT_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        node TEXT NOT NULL,
        state JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (workflow_id, seq)
      )
    `);
  }

  async saveCheckpoint(workflowId: string, node: string, state: unknown): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serializes seq assignment per workflow without a separate ledger.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [workflowId]);
      const { rows } = await client.query<{ next_seq: number }>(
        `SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM ${CHECKPOINT_TABLE} WHERE workflow_id = $1`,
        [workflowId]
      );
      const nextSeq = rows[0]?.next_seq ?? 1;
      await client.query(
        `INSERT INTO ${CHECKPOINT_TABLE} (workflow_id, seq, node, state) VALUES ($1, $2, $3, $4)`,
        [workflowId, nextSeq, node, JSON.stringify(state)]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async loadLatest(workflowId: string): Promise<WorkflowCheckpoint | null> {
    const { rows } = await this.pool.query<{ seq: number; node: string; state: unknown; created_at: Date }>(
      `SELECT seq, node, state, created_at FROM ${CHECKPOINT_TABLE} WHERE workflow_id = $1 ORDER BY seq DESC LIMIT 1`,
      [workflowId]
    );
    const row = rows[0];
    if (row === undefined) return null;
    return { seq: row.seq, node: row.node, state: row.state, createdAt: row.created_at.toISOString() };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
