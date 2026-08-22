# Proposed G0 agent policy baseline

These files are a proposal under the G0 bootstrap exception. They are not repository rules and do not grant authority by themselves. Magnus Ihle must review and apply the corresponding GitHub, runner, sandbox, proxy, and Tailscale controls.

After human approval, ordinary feature pull requests must treat this directory as protected and may not weaken it.

## Enforcement layers

1. GitHub credentials limit builders to assigned repositories and branch/PR operations.
2. Candidate CI rejects protected-path changes against the trusted base.
3. Isolated workspaces mount only assigned paths and never mount production secrets.
4. Role-specific egress proxies enforce `network-policy.json`; application code cannot self-authorize destinations.
5. Protected conformance uses separate read-only/verifier credentials and a signed runner digest.
6. Evidence signing is available only to the protected verifier workflow.

Empty destination lists fail closed. The placeholder Tailscale service list must remain empty until a human supplies exact service identities.
