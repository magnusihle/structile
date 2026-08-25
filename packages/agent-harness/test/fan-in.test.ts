import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { fanOutFanIn, hashArtifactContent, type EvidenceArtifact, type FanOutTask } from "../dist/index.js";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("merge is byte-identical regardless of which task completes first", async () => {
  const artifact: readonly EvidenceArtifact[] = [{ name: "report.json", sha256: hashArtifactContent("shared") }];
  const build = (): { tasks: FanOutTask[]; gates: Deferred<readonly EvidenceArtifact[]>[] } => {
    const gates = [deferred<readonly EvidenceArtifact[]>(), deferred<readonly EvidenceArtifact[]>(), deferred<readonly EvidenceArtifact[]>()];
    const tasks = gates.map((gate, index) => ({ taskId: `task-${String.fromCharCode(97 + index)}`, run: () => gate.promise }));
    return { tasks, gates };
  };

  const forward = build();
  const forwardResult = fanOutFanIn(forward.tasks);
  forward.gates[0]!.resolve(artifact);
  forward.gates[1]!.resolve(artifact);
  forward.gates[2]!.resolve(artifact);

  const reverse = build();
  const reverseResult = fanOutFanIn(reverse.tasks);
  reverse.gates[2]!.resolve(artifact);
  reverse.gates[0]!.resolve(artifact);
  reverse.gates[1]!.resolve(artifact);

  const [first, second] = await Promise.all([forwardResult, reverseResult]);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(first.succeededTaskIds, ["task-a", "task-b", "task-c"]);
  assert.deepEqual(first.artifacts, artifact);
  assert.equal(first.conflicts.length, 0);
});

test("same-identity, different-content artifacts from two tasks are a conflict naming both sources", async () => {
  const tasks: FanOutTask[] = [
    { taskId: "task-a", run: async () => [{ name: "report.json", sha256: hashArtifactContent("from A") }] },
    { taskId: "task-b", run: async () => [{ name: "report.json", sha256: hashArtifactContent("from B") }] }
  ];
  const result = await fanOutFanIn(tasks);
  assert.equal(result.artifacts.length, 0);
  assert.equal(result.conflicts.length, 1);
  const conflict = result.conflicts[0]!;
  assert.equal(conflict.name, "report.json");
  assert.deepEqual(conflict.sources.map((source) => source.taskId), ["task-a", "task-b"]);
  assert.deepEqual(conflict.sources.map((source) => source.sha256), [hashArtifactContent("from A"), hashArtifactContent("from B")]);
});

test("same-identity, same-content artifacts from different tasks merge without a conflict", async () => {
  const tasks: FanOutTask[] = [
    { taskId: "task-a", run: async () => [{ name: "report.json", sha256: hashArtifactContent("identical") }] },
    { taskId: "task-b", run: async () => [{ name: "report.json", sha256: hashArtifactContent("identical") }] }
  ];
  const result = await fanOutFanIn(tasks);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.artifacts, [{ name: "report.json", sha256: hashArtifactContent("identical") }]);
});

test("a rejecting task yields a typed failure entry without corrupting the other tasks' merge", async () => {
  const tasks: FanOutTask[] = [
    { taskId: "task-a", run: async () => [{ name: "report.json", sha256: hashArtifactContent("ok") }] },
    { taskId: "task-b", run: async () => { throw new Error("verifier crashed"); } },
    { taskId: "task-c", run: async () => [{ name: "log.json", sha256: hashArtifactContent("also ok") }] }
  ];
  const result = await fanOutFanIn(tasks);
  assert.deepEqual(result.succeededTaskIds, ["task-a", "task-c"]);
  assert.deepEqual(result.artifacts, [
    { name: "log.json", sha256: hashArtifactContent("also ok") },
    { name: "report.json", sha256: hashArtifactContent("ok") }
  ]);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0]!.taskId, "task-b");
  assert.match(result.failures[0]!.error, /verifier crashed/);
});

test("merge is deterministic under true concurrency across many runs", async () => {
  const makeTasks = (): FanOutTask[] => [
    { taskId: "task-a", run: async () => [{ name: "x.json", sha256: hashArtifactContent("1") }] },
    { taskId: "task-b", run: async () => { await yieldToEventLoop(); return [{ name: "y.json", sha256: hashArtifactContent("2") }]; } },
    { taskId: "task-c", run: async () => [{ name: "x.json", sha256: hashArtifactContent("1") }] }
  ];
  const serializations = new Set<string>();
  for (let iteration = 0; iteration < 50; iteration++) {
    serializations.add(JSON.stringify(await fanOutFanIn(makeTasks())));
  }
  assert.equal(serializations.size, 1);
});
