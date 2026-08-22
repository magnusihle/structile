import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const readJson = async (path: string): Promise<any> => JSON.parse(await readFile(resolve(root, path), "utf8"));

test("builder authority is branch and PR only", async () => {
  const policy = await readJson("policies/agent/permissions.json");
  assert.equal(policy.default, "deny");
  const builder = policy.roles.builder;
  for (const allowed of ["create-branch", "commit", "push-assigned-branch", "open-pull-request"]) assert.ok(builder.allowedActions.includes(allowed));
  for (const denied of ["push-default-branch", "merge", "deploy", "write-protected", "approve-waiver", "sign-evidence", "read-production-secret"]) assert.ok(builder.deniedActions.includes(denied));
});

test("agent network policy is role-specific and default-deny", async () => {
  const network = await readJson("policies/agent/network-policy.json");
  assert.equal(network.defaultEgress, "deny");
  assert.deepEqual(Object.keys(network.roles).sort(), ["builder", "evidence-assembler", "researcher", "verifier"]);
  assert.equal(network.roles.researcher.repositoryWriteCredentials, false);
  assert.equal(network.roles.researcher.secrets, false);
  assert.ok(network.forbiddenDestinations.includes("production-databases"));
});

test("container foundations use immutable digests and narrow Redis semantics", async () => {
  const lock = await readJson("architecture/foundation-lock.json");
  for (const service of [lock.node, lock.postgresql, lock.redis]) assert.match(service.image, /@sha256:[a-f0-9]{64}$/);
  assert.equal(lock.redis.role, "ephemeral-cache-and-rate-limit-coordination-only");
  const compose = await readFile(resolve(root, "compose.yaml"), "utf8");
  assert.match(compose, /data:\n    internal: true/);
  assert.doesNotMatch(compose, /5432:5432|6379:6379/);
  assert.match(compose, /POSTGRES_PASSWORD_FILE/);
  assert.match(compose, /STRUCTILE_DEV_POSTGRES_PASSWORD_FILE/);
  assert.doesNotMatch(compose, /environment: STRUCTILE_DEV_POSTGRES_PASSWORD/);
});

test("G0 repository has no later-gate implementation dependencies", async () => {
  const manifest = await readJson("package.json");
  const names = Object.keys({ ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) });
  for (const forbidden of ["better-auth", "@langchain/langgraph", "langgraph", "redis", "pg", "openai", "@anthropic-ai/sdk"]) assert.ok(!names.includes(forbidden), forbidden);
});
