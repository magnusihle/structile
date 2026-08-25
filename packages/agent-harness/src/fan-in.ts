import { createHash } from "node:crypto";

/** A single named piece of evidence produced by a fanned-out task, identified by name and content hash. */
export interface EvidenceArtifact {
  readonly name: string;
  readonly sha256: string;
}

/** One unit of parallel work: an id for provenance plus the evidence artifacts it produces. */
export interface FanOutTask {
  readonly taskId: string;
  run(): Promise<readonly EvidenceArtifact[]>;
}

/** Two or more tasks produced an artifact with the same name but different content. */
export interface FanInConflict {
  readonly name: string;
  readonly sources: readonly { readonly taskId: string; readonly sha256: string }[];
}

/** A task rejected instead of producing evidence; it does not corrupt the merge of the others. */
export interface FanInFailure {
  readonly taskId: string;
  readonly error: string;
}

export interface FanInResult {
  readonly succeededTaskIds: readonly string[];
  readonly artifacts: readonly EvidenceArtifact[];
  readonly conflicts: readonly FanInConflict[];
  readonly failures: readonly FanInFailure[];
}

function describeError(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return typeof reason === "string" ? reason : JSON.stringify(reason);
}

function byTaskId(a: { readonly taskId: string }, b: { readonly taskId: string }): number {
  return a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0;
}

/**
 * Runs every task concurrently and merges the evidence artifacts they produce into a single
 * deterministic result: byte-identical regardless of which task happens to finish first, because
 * the merge is keyed on stable identities (task id, artifact name) rather than arrival order.
 *
 * Two tasks producing an artifact with the same name but different content are reported as a
 * conflict naming both sources instead of one silently overwriting the other. A rejected task is
 * reported as a typed failure alongside the artifacts the remaining tasks produced.
 */
export async function fanOutFanIn(tasks: readonly FanOutTask[]): Promise<FanInResult> {
  const settled = await Promise.allSettled(tasks.map((task) => task.run()));

  const failures: FanInFailure[] = [];
  const succeededTaskIds: string[] = [];
  const sourcesByName = new Map<string, { readonly taskId: string; readonly sha256: string }[]>();

  settled.forEach((outcome, index) => {
    const taskId = tasks[index]!.taskId;
    if (outcome.status === "rejected") {
      failures.push({ taskId, error: describeError(outcome.reason) });
      return;
    }
    succeededTaskIds.push(taskId);
    for (const artifact of outcome.value) {
      const sources = sourcesByName.get(artifact.name) ?? [];
      sources.push({ taskId, sha256: artifact.sha256 });
      sourcesByName.set(artifact.name, sources);
    }
  });

  const artifacts: EvidenceArtifact[] = [];
  const conflicts: FanInConflict[] = [];
  for (const name of [...sourcesByName.keys()].sort()) {
    const sources = sourcesByName.get(name)!.sort(byTaskId);
    const distinctHashes = new Set(sources.map((source) => source.sha256));
    if (distinctHashes.size === 1) {
      artifacts.push({ name, sha256: sources[0]!.sha256 });
    } else {
      conflicts.push({ name, sources });
    }
  }

  return {
    succeededTaskIds: succeededTaskIds.sort(),
    artifacts,
    conflicts,
    failures: failures.sort(byTaskId)
  };
}

/** Hashes artifact content into the sha256 identity fan-in conflict detection compares. */
export function hashArtifactContent(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}
