import { createHash } from "node:crypto";
import type { AgentAdapter, AgentExecutionContext, AgentProvider, AgentTaskRequest, AgentTaskResult } from "../contracts.js";
import { validateTaskRequest, validateTaskResultAgainstRequest } from "../validation.js";

export class DeterministicMockAdapter implements AgentAdapter {
  constructor(readonly provider: AgentProvider) {}

  async execute(request: AgentTaskRequest, _context: AgentExecutionContext): Promise<AgentTaskResult> {
    validateTaskRequest(request);
    const digest = createHash("sha256").update(JSON.stringify(request)).digest("hex");
    const result: AgentTaskResult = {
      status: "completed",
      changedPaths: [],
      commits: [],
      commands: [],
      claims: request.requirementIds.map((requirementId) => ({ requirementId, summary: `deterministic-mock:${digest.slice(0, 16)}` })),
      risks: [],
      unresolvedQuestions: [],
      requestedApprovals: [],
      usage: { durationMs: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 }
    };
    validateTaskResultAgainstRequest(request, result);
    return await Promise.resolve(result);
  }
}
