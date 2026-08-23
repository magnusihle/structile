import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import type { AgentAdapter, AgentExecutionContext, AgentTaskRequest, AgentTaskResult } from "../contracts.js";
import type { ProcessInvocation, ProcessTransport } from "../spawn-transport.js";
import { parseAgentTaskResult, validateNoCredentialExposure, validateTaskRequest, validateTaskResultAgainstRequest } from "../validation.js";

const READ_CHUNK_BYTES = 64 * 1024;

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function requireFreshResultPath(path: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    if (isMissingFile(error)) return;
    throw error;
  }
  throw new Error("Codex result path must not already exist");
}

async function readBoundedResultFile(path: string, maxOutputBytes: number): Promise<string | undefined> {
  let pathMetadata;
  try {
    pathMetadata = await lstat(path);
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
  if (!pathMetadata.isFile()) throw new Error("Codex result path must be a regular file");

  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | noFollow);
  try {
    const openedMetadata = await handle.stat();
    if (!openedMetadata.isFile()) throw new Error("Codex result path must be a regular file");
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, maxOutputBytes - outputBytes + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null);
      if (bytesRead === 0) break;
      outputBytes += bytesRead;
      if (outputBytes > maxOutputBytes) throw new Error("agent output budget exceeded");
      chunks.push(Buffer.from(chunk.subarray(0, bytesRead)));
    }
    return Buffer.concat(chunks, outputBytes).toString("utf8");
  } finally {
    await handle.close();
  }
}

function taskPrompt(request: AgentTaskRequest): string {
  return [
    "Execute the bounded Structile development task below.",
    "Return only the normalized JSON result required by the supplied output schema.",
    JSON.stringify({
      taskId: request.taskId,
      requirementIds: request.requirementIds,
      requirementDigest: request.requirementDigest,
      testDigest: request.testDigest,
      repository: request.repository,
      baseCommit: request.baseCommit,
      branch: request.branch,
      allowedPaths: request.allowedPaths,
      allowedTools: request.allowedTools,
      networkDestinations: request.networkDestinations,
      budget: request.budget,
      task: request.prompt
    })
  ].join("\n\n");
}

export class CodexAdapter implements AgentAdapter {
  readonly provider = "codex" as const;

  constructor(private readonly transport: ProcessTransport, private readonly executable = "codex") {}

  buildInvocation(request: AgentTaskRequest, context: AgentExecutionContext): ProcessInvocation {
    validateTaskRequest(request);
    return {
      program: this.executable,
      args: [
        "exec",
        "--ephemeral",
        "--sandbox",
        "workspace-write",
        "--output-schema",
        context.resultSchemaPath,
        "--output-last-message",
        context.resultPath,
        taskPrompt(request)
      ],
      cwd: context.workspace,
      environment: context.environment,
      timeoutMs: request.budget.timeoutMs,
      maxOutputBytes: request.budget.maxOutputBytes
    };
  }

  async execute(request: AgentTaskRequest, context: AgentExecutionContext): Promise<AgentTaskResult> {
    const invocation = this.buildInvocation(request, context);
    await requireFreshResultPath(context.resultPath);
    const result = await this.transport.run(invocation);
    if (result.exitCode !== 0) throw new Error(`codex exec failed with exit ${result.exitCode}`);
    const fileOutput = await readBoundedResultFile(context.resultPath, request.budget.maxOutputBytes);
    if (fileOutput === undefined && this.transport.materializesOutputFiles === true) {
      throw new Error("codex exec did not create its result file");
    }
    const normalized = parseAgentTaskResult(fileOutput ?? result.stdout);
    validateNoCredentialExposure(context, normalized);
    validateTaskResultAgainstRequest(request, normalized);
    return normalized;
  }
}
