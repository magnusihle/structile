# Research basis and implementation cautions

Sources were verified on 2026-08-22. Re-check version-sensitive behavior before implementation upgrades.

## Frontend distribution

- shadcn officially supports custom registries for distributing components, hooks, pages, configuration and other source files: <https://ui.shadcn.com/docs/registry>
- Its registry-item schema supports dependency versions and recommends pinning GitHub registry dependencies to tags or full commit SHAs for reproducibility: <https://ui.shadcn.com/docs/registry/registry-item-json>
- shadcn/ui is MIT-licensed: <https://github.com/shadcn-ui/ui/blob/main/LICENSE.md>

Conclusion: shadcn is a good source-distribution layer for owned components, but it does not provide the database specification runtime, tenant authorization, capability protocol or conformance model. Keep the install-time registry separate from the runtime component catalog.

## Better Auth

- Google provider: <https://better-auth.com/docs/authentication/google>
- Microsoft provider: <https://better-auth.com/docs/authentication/microsoft>
- Organization plugin, invitations and roles: <https://better-auth.com/docs/plugins/organization>
- Better Auth account linking is enabled by default for verified-email providers: <https://better-auth.com/docs/concepts/users-accounts>
- Better Auth uses a database for users, sessions and plugin data: <https://better-auth.com/docs/concepts/database>

Implementation cautions:

1. Explicitly disable user organization creation; the organization plugin permits it by default unless configured.
2. Do not enable dynamic tenant-created roles; v1 has four fixed roles mapped to product permissions.
3. Do not accept default verified-email account linking as the platform's full proof. Use issuer+subject identity and require authenticated/recent-auth explicit linking under the documented policy.
4. Pin Better Auth and migration versions and test Google/Microsoft issuer, tenant, invite and session edge cases with deterministic provider simulators.

## PostgreSQL and pooling

- PostgreSQL warm standby, streaming and synchronous replication: <https://www.postgresql.org/docs/current/warm-standby.html>
- Patroni synchronous mode prevents promotion of a standby that may lack acknowledged transactions, trading write availability for durability: <https://patroni.readthedocs.io/en/latest/replication_modes.html>
- PgBouncer creates pools per database/user and its theoretical connection/file-descriptor use grows with databases and users: <https://www.pgbouncer.org/config.html>

Conclusion: one logical database/role per tenant is viable only with bounded cluster placement, measured pool limits and automated lifecycle/restore tests. It is not “free isolation.”

## Coolify and Hetzner

- Coolify's multiple-server deployment feature is documented as experimental and requires an external load balancer: <https://coolify.io/docs/knowledge-base/server/multiple-servers>
- Hetzner load balancers support health checks: <https://docs.hetzner.com/networking/load-balancers/faq/>
- Hetzner server backups are daily disk copies, may be inconsistent while running and exclude attached Volumes: <https://docs.hetzner.com/cloud/servers/backups-snapshots/faq/>
- Hetzner Object Storage is S3-compatible: <https://docs.hetzner.com/storage/general/which-storage-is-right-for-me/>

Conclusion: Coolify is an operational/deployment interface, not the HA controller. Host backups do not satisfy PostgreSQL RPO/RTO; use WAL-aware backup/restore and independent failure drills.

## Redis

- Redis Sentinel provides monitoring and automatic failover: <https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/>
- Redis warns that replication without appropriate persistence/restart design can propagate empty state: <https://redis.io/docs/latest/operate/oss_and_stack/management/replication/>

Conclusion: Redis is mandatory but non-authoritative. Security-sensitive rate limits need bounded fail-safe behavior, while specifications, sessions, queues, audit and jobs remain in PostgreSQL.

## Tailscale

- Tailscale access control supports deny-by-default ACLs/grants, but without an access-control section the default policy may allow all devices: <https://tailscale.com/docs/features/access-control/acls>
- Tailscale SSH: <https://tailscale.com/docs/features/tailscale-ssh>

Conclusion: Tailscale is the management transport, not the only authentication layer. Commit/test an explicit policy; isolate roles/tags and keep public application/OAuth traffic outside the tailnet.

## LangGraph and development agents

- LangGraph's open-source runtime is a low-level durable orchestration framework: <https://docs.langchain.com/oss/javascript/langgraph/overview>
- Checkpointers enable fault recovery, human interrupts, replay and parallel pending-write recovery: <https://docs.langchain.com/oss/javascript/langgraph/checkpointers>
- LangGraph is MIT-licensed: <https://github.com/langchain-ai/langgraph/blob/main/LICENSE>
- Codex non-interactive mode: <https://developers.openai.com/codex/non-interactive-mode>
- OpenAI recommends API-key/workload credentials for automation and says not to expose Codex execution to untrusted/public environments: <https://developers.openai.com/codex/auth/>
- Anthropic states third-party Agent SDK products need API-key authentication unless Claude.ai login use is specifically approved: <https://docs.anthropic.com/en/docs/claude-code/sdk>

Conclusion: LangGraph fits the approved durable harness behavior, but it does not replace the PostgreSQL queue, authorization, idempotency or evidence service. Headless account sessions are private development/prototype credentials, never the production SaaS authoring mechanism.

## Graphify

- Graphify supports local code parsing, commit-queryable graph output and Claude Code/Codex integration: <https://github.com/Graphify-Labs/graphify>

Conclusion: use a code-only commit-pinned index as optional context. Do not deploy it with applications and do not treat inferred edges as proof.

## License

- Apache-2.0 grants commercial copyright rights and an explicit contributor patent license: <https://www.apache.org/licenses/LICENSE-2.0>

Conclusion: use Apache-2.0 for original public core, retain dependency notices, and keep trademark policy separate.

