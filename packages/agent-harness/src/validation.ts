import type { AgentTaskRequest, AgentTaskResult, AgentTaskStatus } from "./contracts.js";

const ID = /^[A-Z][A-Z0-9]*-[0-9]{3}$/;
const SHA = /^[a-f0-9]{40,64}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HEX256 = /^[a-f0-9]{64}$/;
const statuses = new Set<AgentTaskStatus>(["completed", "blocked", "needs-human", "failed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function allowedPath(path: string, patterns: readonly string[]): boolean {
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) return false;
  return patterns.some((pattern) => {
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -2);
      return path.startsWith(prefix) && path.length > prefix.length;
    }
    return path === pattern;
  });
}

export function validateTaskRequest(request: AgentTaskRequest): void {
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(request.taskId)) throw new Error("invalid taskId");
  if (request.requirementIds.length === 0 || request.requirementIds.some((id) => !ID.test(id))) throw new Error("invalid requirementIds");
  if (!SHA256.test(request.requirementDigest) || !SHA256.test(request.testDigest)) throw new Error("invalid protected digest");
  if (!SHA.test(request.baseCommit)) throw new Error("invalid baseCommit");
  if (!request.repository.startsWith("https://github.com/")) throw new Error("repository must be an HTTPS GitHub URL");
  if (!/^[A-Za-z0-9._/-]+$/.test(request.branch) || request.branch === "main") throw new Error("invalid implementation branch");
  if (request.allowedPaths.length === 0 || request.allowedPaths.some((path) => path.startsWith("/") || path.includes(".."))) throw new Error("invalid allowedPaths");
  if (!Number.isInteger(request.budget.timeoutMs) || request.budget.timeoutMs <= 0) throw new Error("invalid timeout budget");
  if (!Number.isInteger(request.budget.maxOutputBytes) || request.budget.maxOutputBytes <= 0) throw new Error("invalid output budget");
  if (request.prompt.trim().length === 0) throw new Error("prompt is required");
}

export function parseAgentTaskResult(text: string): AgentTaskResult {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || typeof value.status !== "string" || !statuses.has(value.status as AgentTaskStatus)) throw new Error("invalid result status");
  if (!hasExactKeys(value, ["status", "changedPaths", "commits", "commands", "claims", "risks", "unresolvedQuestions", "requestedApprovals", "usage"])) throw new Error("result has unexpected or missing keys");
  for (const key of ["changedPaths", "commits", "risks", "unresolvedQuestions", "requestedApprovals"] as const) {
    if (!isStringArray(value[key])) throw new Error(`invalid result ${key}`);
  }
  if (!(value.commits as string[]).every((commit) => SHA.test(commit))) throw new Error("invalid result commits");
  if (!Array.isArray(value.commands) || !value.commands.every((command) => isRecord(command) && hasExactKeys(command, command.artifactHashes === undefined ? ["program", "args", "exitCode"] : ["program", "args", "exitCode", "artifactHashes"]) && typeof command.program === "string" && command.program.length > 0 && isStringArray(command.args) && Number.isInteger(command.exitCode) && (command.artifactHashes === undefined || (isStringArray(command.artifactHashes) && command.artifactHashes.every((hash) => HEX256.test(hash)))))) throw new Error("invalid result commands");
  if (!Array.isArray(value.claims) || !value.claims.every((claim) => isRecord(claim) && hasExactKeys(claim, ["requirementId", "summary"]) && typeof claim.requirementId === "string" && ID.test(claim.requirementId) && typeof claim.summary === "string")) throw new Error("invalid result claims");
  if (!isRecord(value.usage) || !Number.isInteger(value.usage.durationMs) || (value.usage.durationMs as number) < 0) throw new Error("invalid result usage");
  if (Object.keys(value.usage).some((key) => !["durationMs", "inputTokens", "cachedInputTokens", "outputTokens", "estimatedCostUsd"].includes(key))) throw new Error("invalid result usage keys");
  for (const key of ["inputTokens", "cachedInputTokens", "outputTokens"] as const) if (value.usage[key] !== undefined && (!Number.isInteger(value.usage[key]) || (value.usage[key] as number) < 0)) throw new Error(`invalid result usage ${key}`);
  if (value.usage.estimatedCostUsd !== undefined && (typeof value.usage.estimatedCostUsd !== "number" || value.usage.estimatedCostUsd < 0)) throw new Error("invalid result usage estimatedCostUsd");
  return value as unknown as AgentTaskResult;
}

export function validateTaskResultAgainstRequest(request: AgentTaskRequest, result: AgentTaskResult): void {
  if (result.changedPaths.some((path) => !allowedPath(path, request.allowedPaths))) throw new Error("agent changed a path outside its budget");
  if (result.commands.some((command) => !request.allowedTools.includes(command.program.split(/[\\/]/).at(-1) ?? command.program))) throw new Error("agent used a tool outside its budget");
  if (result.claims.some((claim) => !request.requirementIds.includes(claim.requirementId))) throw new Error("agent claimed a requirement outside its task");
  if (result.usage.durationMs > request.budget.timeoutMs) throw new Error("agent reported duration beyond its budget");
  const tokens = (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0);
  if (request.budget.tokenLimit !== undefined && tokens > request.budget.tokenLimit) throw new Error("agent reported tokens beyond its budget");
  if (request.budget.costLimitUsd !== undefined && (result.usage.estimatedCostUsd ?? 0) > request.budget.costLimitUsd) throw new Error("agent reported cost beyond its budget");
}
