import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  CodexAdapter,
  ClaudeCodeAdapter,
  DeterministicMockAdapter,
  type AgentExecutionContext,
  type AgentTaskRequest,
  type AgentTaskResult,
  type ProcessInvocation,
  type ProcessTransport,
  validateTaskRequest
} from "../dist/index.js";

const request = {
  taskId: "task:g0:0001",
  requirementIds: ["HAR-001", "HAR-002"],
  requirementDigest: `sha256:${"a".repeat(64)}`,
  testDigest: `sha256:${"b".repeat(64)}`,
  repository: "https://github.com/magnusihle/structile",
  baseCommit: "c".repeat(40),
  branch: "g0/test",
  allowedPaths: ["packages/agent-harness/**"],
  allowedTools: ["git", "node"],
  networkDestinations: ["api.openai.com"],
  budget: { timeoutMs: 60_000, maxOutputBytes: 65_536 },
  prompt: "Exercise the deterministic adapter contract."
} satisfies AgentTaskRequest;
const context = {
  workspace: "/workspace",
  resultSchemaPath: "/policy/agent-result.schema.json",
  resultPath: `/tmp/structile-adapter-result-${process.pid}.json`,
  environment: { PATH: "/usr/bin", CODEX_API_KEY: "canary-not-returned" }
} satisfies AgentExecutionContext;

test("Codex adapter uses explicit non-interactive sandboxed arguments without a shell", async () => {
  let captured: ProcessInvocation | undefined;
  const expected: AgentTaskResult = {
    status: "completed", changedPaths: [], commits: [], commands: [], claims: [], risks: [],
    unresolvedQuestions: [], requestedApprovals: [], usage: { durationMs: 1 }
  };
  const transport: ProcessTransport = { run: async (invocation) => { captured = invocation; return { exitCode: 0, stdout: JSON.stringify(expected), stderr: "" }; } };
  const adapter = new CodexAdapter(transport);
  assert.deepEqual(await adapter.execute(request, context), expected);
  assert.ok(captured);
  const invocation = captured as ProcessInvocation;
  assert.equal(invocation.program, "codex");
  assert.equal(invocation.args[0], "exec");
  assert.ok(invocation.args.includes("--ephemeral"));
  assert.ok(invocation.args.includes("workspace-write"));
  assert.ok(invocation.args.includes("--output-schema"));
  assert.ok(!invocation.args.includes("danger-full-access"));
  assert.equal(invocation.environment.CODEX_API_KEY, "canary-not-returned");
  assert.doesNotMatch(JSON.stringify(expected), /canary-not-returned/);
});

test("Codex adapter reads the bounded final-message file instead of streamed stdout", async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), "structile-codex-result-"));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const expected: AgentTaskResult = {
    status: "completed", changedPaths: [], commits: [], commands: [], claims: [], risks: [],
    unresolvedQuestions: [], requestedApprovals: [], usage: { durationMs: 1 }
  };
  const fileContext = { ...context, resultPath: resolve(directory, "result.json") };
  const transport: ProcessTransport = {
    materializesOutputFiles: true,
    run: async () => {
      await writeFile(fileContext.resultPath, JSON.stringify(expected));
      return { exitCode: 0, stdout: "streamed progress, not the final result", stderr: "" };
    }
  };
  assert.deepEqual(await new CodexAdapter(transport).execute(request, fileContext), expected);
});

test("Codex adapter rejects stale, missing, and oversized final-message files", async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), "structile-codex-result-invalid-"));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const staleContext = { ...context, resultPath: resolve(directory, "stale.json") };
  await writeFile(staleContext.resultPath, "stale");
  let invoked = false;
  const staleTransport: ProcessTransport = {
    materializesOutputFiles: true,
    run: async () => { invoked = true; return { exitCode: 0, stdout: "{}", stderr: "" }; }
  };
  await assert.rejects(new CodexAdapter(staleTransport).execute(request, staleContext), /must not already exist/);
  assert.equal(invoked, false);

  const missingContext = { ...context, resultPath: resolve(directory, "missing.json") };
  const missingTransport: ProcessTransport = {
    materializesOutputFiles: true,
    run: async () => ({ exitCode: 0, stdout: "{}", stderr: "" })
  };
  await assert.rejects(new CodexAdapter(missingTransport).execute(request, missingContext), /did not create its result file/);

  const oversizedContext = { ...context, resultPath: resolve(directory, "oversized.json") };
  const smallBudgetRequest = { ...request, budget: { ...request.budget, maxOutputBytes: 8 } };
  const oversizedTransport: ProcessTransport = {
    materializesOutputFiles: true,
    run: async () => {
      await writeFile(oversizedContext.resultPath, "x".repeat(9));
      return { exitCode: 0, stdout: "{}", stderr: "" };
    }
  };
  await assert.rejects(new CodexAdapter(oversizedTransport).execute(smallBudgetRequest, oversizedContext), /output budget exceeded/);
});

test("Claude contract can remain behind the deterministic mock transport", async () => {
  const mock = new DeterministicMockAdapter("claude-code");
  const adapter = new ClaudeCodeAdapter({ execute: (task, execution) => mock.execute(task, execution) });
  const first = await adapter.execute(request, context);
  const second = await adapter.execute(request, context);
  assert.deepEqual(first, second);
  assert.equal(first.status, "completed");
  assert.equal(first.changedPaths.length, 0);
});

test("Codex and Claude deterministic envelopes normalize identically", async () => {
  const codex = await new DeterministicMockAdapter("codex").execute(request, context);
  const claude = await new DeterministicMockAdapter("claude-code").execute(request, context);
  assert.deepEqual(Object.keys(codex).sort(), Object.keys(claude).sort());
  assert.deepEqual(codex.claims, claude.claims);
});

test("both operational contracts reject results outside path and tool budgets", async () => {
  const outside: AgentTaskResult = {
    status: "completed", changedPaths: ["requirements/requirements.json"], commits: [],
    commands: [{ program: "curl", args: [], exitCode: 0 }], claims: [], risks: [],
    unresolvedQuestions: [], requestedApprovals: [], usage: { durationMs: 1 }
  };
  const codex = new CodexAdapter({ run: async () => ({ exitCode: 0, stdout: JSON.stringify(outside), stderr: "" }) });
  await assert.rejects(codex.execute(request, context), /outside its budget/);
  const claude = new ClaudeCodeAdapter({ execute: async () => outside });
  await assert.rejects(claude.execute(request, context), /outside its budget/);
});

test("both operational contracts reject credential values in normalized results", async () => {
  const exposed: AgentTaskResult = {
    status: "failed", changedPaths: [], commits: [], commands: [], claims: [],
    risks: ["provider returned canary-not-returned"], unresolvedQuestions: [],
    requestedApprovals: [], usage: { durationMs: 1 }
  };
  const codex = new CodexAdapter({ run: async () => ({ exitCode: 0, stdout: JSON.stringify(exposed), stderr: "" }) });
  await assert.rejects(codex.execute(request, context), /exposed a credential value/);
  const claude = new ClaudeCodeAdapter({ execute: async () => exposed });
  await assert.rejects(claude.execute(request, context), /exposed a credential value/);
});

test("Claude transport results receive the same runtime schema validation as Codex output", async () => {
  const malformed = {
    status: "completed", changedPaths: [], commits: [], commands: [], claims: [], risks: [],
    unresolvedQuestions: [], requestedApprovals: [], usage: { durationMs: 1 }, unexpected: true
  } as unknown as AgentTaskResult;
  const claude = new ClaudeCodeAdapter({ execute: async () => malformed });
  await assert.rejects(claude.execute(request, context), /unexpected or missing keys/);
});

test("task envelopes reject repository-origin confusion and malformed branch or path budgets", () => {
  for (const repository of [
    "https://github.com.evil.example/magnusihle/structile",
    "https://github.com@evil.example/magnusihle/structile",
    "https://github.com/magnusihle/structile?credential=canary",
    "https://github.com/magnusihle/structile/extra"
  ]) {
    assert.throws(() => validateTaskRequest({ ...request, repository }), /canonical HTTPS GitHub repository URL/);
  }

  for (const branch of ["main", "refs/heads/main", "/g0/test", "g0//test", "g0/../main", "g0/test.lock"]) {
    assert.throws(() => validateTaskRequest({ ...request, branch }), /invalid implementation branch/);
  }

  for (const allowedPaths of [
    ["packages/agent-harness/../auth/**"],
    ["packages\\agent-harness\\**"],
    ["packages/*/src/**"],
    ["packages//agent-harness/**"]
  ]) {
    assert.throws(() => validateTaskRequest({ ...request, allowedPaths }), /invalid allowedPaths/);
  }

  assert.doesNotThrow(() => validateTaskRequest(request));
});
