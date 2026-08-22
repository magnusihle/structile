import type { AgentAdapter, AgentExecutionContext, AgentTaskRequest, AgentTaskResult } from "../contracts.js";
import { validateTaskRequest, validateTaskResultAgainstRequest } from "../validation.js";

export interface ClaudeCodeTransport {
  execute(request: AgentTaskRequest, context: AgentExecutionContext): Promise<AgentTaskResult>;
}

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly provider = "claude-code" as const;

  constructor(private readonly transport: ClaudeCodeTransport) {}

  async execute(request: AgentTaskRequest, context: AgentExecutionContext): Promise<AgentTaskResult> {
    validateTaskRequest(request);
    const normalized = await this.transport.execute(request, context);
    validateTaskResultAgainstRequest(request, normalized);
    return normalized;
  }
}
