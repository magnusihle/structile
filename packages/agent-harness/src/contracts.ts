export type AgentProvider = "claude-code" | "codex";
export type AgentTaskStatus = "completed" | "blocked" | "needs-human" | "failed";

export interface AgentTaskBudget {
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly tokenLimit?: number;
  readonly costLimitUsd?: number;
}

export interface AgentTaskRequest {
  readonly taskId: string;
  readonly requirementIds: readonly string[];
  readonly requirementDigest: string;
  readonly testDigest: string;
  readonly repository: string;
  readonly baseCommit: string;
  readonly branch: string;
  readonly allowedPaths: readonly string[];
  readonly allowedTools: readonly string[];
  readonly networkDestinations: readonly string[];
  readonly budget: AgentTaskBudget;
  readonly prompt: string;
}

export interface AgentCommandResult {
  readonly program: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly artifactHashes?: readonly string[];
}

export interface AgentRequirementClaim {
  readonly requirementId: string;
  readonly summary: string;
}

export interface AgentUsage {
  readonly durationMs: number;
  readonly inputTokens?: number;
  readonly cachedInputTokens?: number;
  readonly outputTokens?: number;
  readonly estimatedCostUsd?: number;
}

export interface AgentTaskResult {
  readonly status: AgentTaskStatus;
  readonly changedPaths: readonly string[];
  readonly commits: readonly string[];
  readonly commands: readonly AgentCommandResult[];
  readonly claims: readonly AgentRequirementClaim[];
  readonly risks: readonly string[];
  readonly unresolvedQuestions: readonly string[];
  readonly requestedApprovals: readonly string[];
  readonly usage: AgentUsage;
}

export interface AgentExecutionContext {
  readonly workspace: string;
  readonly resultSchemaPath: string;
  readonly resultPath: string;
  readonly environment: Readonly<Record<string, string>>;
}

export interface AgentAdapter {
  readonly provider: AgentProvider;
  execute(request: AgentTaskRequest, context: AgentExecutionContext): Promise<AgentTaskResult>;
}
