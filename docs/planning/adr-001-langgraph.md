# ADR-001: Use LangGraph for the development harness

Status: **Accepted with a mandatory spike and exit criteria**  
Scope: Claude Code/Codex repository-development harness only  
Not in scope: customer UI runtime, capability query execution or application business workflows

## Context

The harness must:

- Resume after process or host failure.
- Pause for human approval and continue hours or days later.
- Branch into multiple builder/verifier agents and combine evidence.
- Maintain a persistent scheduled task queue.
- Mix deterministic policy/test steps with model-driven code work.
- Support Claude Code and Codex behind one state model.

A single shell script or direct CLI wrapper does not satisfy these requirements without recreating a state machine, persistence, replay and interrupt semantics.

## Decision

Use the open-source TypeScript LangGraph runtime as the workflow state machine with its PostgreSQL checkpointer. Implement Claude Code and Codex as nodes behind a normalized adapter. Keep the authoritative task queue, authorization, leases, GitHub side-effect ledger, evidence, waivers and release policy in ordinary typed services/tables outside LangGraph.

Do not enable LangSmith by default. Use self-hosted redacted logs/metrics/traces. No runtime dependency on LangChain model abstractions is required where direct provider/CLI adapters are clearer.

## Why it now fits

LangGraph provides checkpointed fault recovery, durable human interrupts, parallel super-steps/fan-in and deterministic-plus-agentic graph composition. Those map directly to the approved behavior. Its MIT license is compatible with the Apache-2.0 core.

## What LangGraph does not solve

- A reliable job queue/scheduler.
- Exactly-once external effects.
- GitHub permissions or protected branches.
- Agent sandbox/network enforcement.
- Evidence integrity, signatures or release policy.
- Secret management.
- Semantic correctness of model output.

Treating it as any of those would be an architecture failure.

## Alternatives considered

| Alternative | Result |
| --- | --- |
| Plain TypeScript state machine | Rejected for v1 requirements; would recreate checkpoint/interrupt/replay semantics. Remains the fallback for a reduced scope. |
| Temporal | Stronger general-purpose durable execution and scheduling, but materially heavier for the first platform and less agent-native. Revisit if LangGraph plus the job queue cannot meet reliability/operability gates. |
| BullMQ/Redis-only workflow | Rejected: Redis is not allowed to be durable truth and the required human/state semantics would be custom. |
| Claude Code/Codex native session state only | Rejected: provider-specific, not a shared durable authority, and insufficient for independent evidence fan-in. |
| LangGraph/Smith managed platform | Not selected by default because external observability/data transfer is opt-in only and the core must self-host. |

## Mandatory v0.2 spike

Implement the same small workflow twice: (A) LangGraph + PostgreSQL checkpointer and (B) a minimal explicit TypeScript state machine using the same PostgreSQL queue. Workflow: plan -> human interrupt -> two parallel mock builders -> verifier -> one idempotent mock PR.

Automate faults at every boundary and measure:

- Correct resume and no duplicated side effect.
- State inspectability and migration behavior.
- Test determinism and ability to replace provider nodes.
- Operational dependencies, failure modes and upgrade complexity.
- Lines of custom orchestration code, latency and storage growth.
- Ability to run fully self-hosted with external telemetry disabled.

LangGraph remains accepted only if all crash/interrupt/fan-in tests pass, no hidden hosted dependency exists, state can be versioned/migrated and the custom idempotency layer remains small/auditable. Otherwise issue a replacement ADR choosing Temporal or the explicit state machine; do not layer ad-hoc retries around failing semantics.

## Consequences

Positive:

- Direct support for the required long-running agent workflow.
- Shared orchestration across Claude Code and Codex.
- Deterministic policy nodes remain visible around model nodes.
- Easier failure injection and trajectory inspection.

Costs/risks:

- Another framework and state schema to upgrade.
- Replay can duplicate non-idempotent side effects if node design is careless.
- Developers may incorrectly put authorization or business state in graph memory.
- Documentation often promotes LangSmith; the team must maintain self-hosted observability.

Mitigations are normative in `docs/agent-harness.md` and the harness requirements/tests.

