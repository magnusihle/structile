import type { AgentAdapter, AgentExecutionContext, AgentTaskRequest, AgentTaskResult } from "../contracts.js";
import type { ProcessInvocation, ProcessTransport } from "../spawn-transport.js";
import { parseAgentTaskResult, validateTaskRequest, validateTaskResultAgainstRequest } from "../validation.js";

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
    const result = await this.transport.run(invocation);
    if (result.exitCode !== 0) throw new Error(`codex exec failed with exit ${result.exitCode}`);
    const normalized = parseAgentTaskResult(result.stdout);
    validateTaskResultAgainstRequest(request, normalized);
    return normalized;
  }
}
