# Decisions and assumptions

This file records answers approved during scope discovery. Technical assumptions marked **provisional** must be proved or rejected by a spike or failure drill; builders may not silently reinterpret them.

## Locked product decisions

The `Why` column cites rationale recorded elsewhere in this package; `Not recorded.` marks decisions approved without a written reason, which is itself information.

| Area | Decision | Why |
| --- | --- | --- |
| Delivery | Complete v1 requirements staged across v0.1–v1.0. | Each gate makes the next falsifiable (`docs/release-gates.md`). |
| Authoring order | Deterministic manual/specification runtime first; AI authoring at G5. | AI cannot hide gaps in an unproven runtime (`docs/release-gates.md`, gate rule 6). |
| Actions | Specify the protocol now; execution begins only after read-only tenant isolation passes. | Freezes the contract early, bounds write blast radius (`docs/release-gates.md`). |
| Reference | Do not reuse `toll-refundering` as a code fixture. It was only a capability example. | Reference fixture rule (`docs/release-gates.md`). |
| Recreation | Functional, structural and design-system parity are required. Screenshot-to-spec arrives at G5. | Parity is the falsifiable definition of platform sufficiency (`verification/reference-fixture.md`). |
| Scale | Certify one deployed product for 1,000 tenants, 10,000 active users and 1,000 concurrent sessions. | Not recorded; exact cluster caps come from benchmarks before G6 (below). |
| SLO | At certified load: p95 platform reads <=150 ms, writes <=300 ms, dashboard usable <=1.5 s. | Certified under the protected performance profile (`verification/test-strategy.md`). |
| Authentication | Better Auth; Google and Microsoft OAuth only. No username/password or public self-signup. | Removes credential attack surface; provider verified (`docs/research-sources.md`, `docs/security-threat-model.md`). |
| Provisioning | Tenants through a trusted developer/API path; membership by invite. | Prevents unvetted tenants and signup abuse (`docs/security-threat-model.md`). |
| Identity policy | A tenant may restrict Google Workspace domains or Microsoft Entra tenant IDs. | Identity and authorization invariants (`docs/security-threat-model.md`). |
| Membership | One user may belong to multiple tenants. | Not recorded. |
| Roles | Fixed owner/admin/editor/viewer roles mapped to product-defined permissions. | Fixed roles keep platform authorization decidable (`docs/architecture.md`). |
| Publishing | Users publish personal dashboards; tenant admins publish shared dashboards. | Not recorded. |
| UI scope | Authenticated application, administration and settings pages. Public/SEO/embed surfaces are out of v1. | Not recorded. |
| UI technology | React and TypeScript are mandatory; project-specific backends may use any language. | One certified frontend stack; backend freedom via the capability adapter (`docs/architecture.md`). |
| Distribution | Versioned runtime packages and component registry installed and pinned in each product. | Pinned versions make N/N-1 and conformance reproducible (`docs/architecture.md`). |
| Extensions | Trusted product-specific components require code review and deployment. No tenant JavaScript. | Extension rule (`docs/responsibility-boundaries.md`). |
| Devices | Desktop conformance only in v1. Tablet/mobile are explicitly out of scope. | Not recorded. |
| Localization | Locale-aware dates, numbers, currencies/time zones; product translation catalogs and switching. No RTL requirement. | Not recorded. |
| Branding | Product tokens, limited tenant logo/accent overrides, user light/dark mode. | Not recorded. |
| Compatibility | Runtime supports current and previous major UI specification versions with migration and rollback. | Truthful released-majors-only matrix; no synthetic history (`requirements/requirements.json` SPEC-002). |
| Data exposure | Developers define the maximum capability surface; tenant admins may only restrict it. | Admins restricting, never expanding, keeps the surface developer-audited (`docs/architecture.md`). |
| Queries | Joins only through backend-declared, authorized relationships. No raw SQL or inferred joins. | Injection and exfiltration controls (`docs/security-threat-model.md`). |
| Exports | Audited, permission-checked CSV/XLSX with row/byte/time limits. | Exports are the easiest bulk-exfiltration path (`docs/security-threat-model.md`). |
| Privileged auth | Recent OAuth reauthentication for publishing, exports and mutations; optional upstream MFA requirement. | Identity invariants (`docs/security-threat-model.md`). |
| Audit | One-year default retention, configurable from 90 days to seven years. | Audit policy (`docs/security-threat-model.md`); exact defaults not recorded. |
| Mutations | Risk-based preview; reauthentication for deletes, bulk and high-impact actions. | Threat-to-control mapping (`docs/security-threat-model.md`). |
| Database | PostgreSQL is mandatory. Each tenant receives a separate logical database and role. | Tenant database topology, provisional (below). |
| Control data | One control-plane database per SaaS product; never one global database coupling all products. | Avoids one blast radius coupling every product (`docs/architecture.md`). |
| Cache | Redis is mandatory for caching/rate limiting but never a durable source of truth. | A cache that becomes truth escapes backup and audit guarantees (`docs/architecture.md`). |
| Packaging | Docker and Docker Compose are mandatory developer/deployment artifacts. | Frozen, reproducible deployment contract (`docs/architecture.md`). |
| Hosting | Coolify on Hetzner; Tailscale is the private management plane. | Verified sources and cautions (`docs/research-sources.md`). |
| Failure target | Component, host and primary database failure recovery under five minutes. | Disaster recovery, provisional (below). |
| Data loss | Local primary failover targets RPO 0. | Disaster recovery, provisional (below). |
| Agents | Claude Code and Codex supported from day one. | Not recorded. |
| Agent authority | Branch and pull request only; never merge, production deploy, requirement-test edits or waiver approval. | Evidence must never be produced by the hands it judges (`HANDOFF.md`, `docs/security-threat-model.md`). |
| Harness runtime | Developer workstations and private self-hosted CI runners. | Trusted execution environments (`docs/agent-harness.md`). |
| Harness behavior | Durable resume, long-lived human interrupts, multi-agent fan-out/fan-in and persistent scheduling. | Accepted with mandatory spike (`docs/adr-001-langgraph.md`). |
| AI providers | Anthropic and OpenAI behind a provider-neutral adapter. | Provider neutrality avoids single-vendor lock at the contract layer (`docs/architecture.md`). |
| AI context | Capability metadata plus user prompt/screenshots; no live customer records by default. | Least-privilege model context (`docs/security-threat-model.md`, `verification/ai-evaluation-plan.md`). |
| AI credentials | Headless sessions allowed only for private prototypes/harness. Production service credentials remain a release blocker. | Explicitly unresolved (below). |
| Observability | External telemetry disabled by default; secrets and raw customer data are prohibited from all telemetry. | Telemetry as an exfiltration channel (`docs/security-threat-model.md`). |
| Open source | Design system, runtime, schemas, SDKs, reference control plane, agent harness and conformance suite. | License and boundary reasoning (`docs/open-source-governance.md`). |
| Residency | Selected independently by each SaaS product and enforced consistently across primary, replicas, backups and logs. | Not recorded. |

## Planner decisions made from uncertainty

### Tenant database topology — provisional

V1 certifies one logical database and one least-privilege role per tenant on bounded shared HA PostgreSQL clusters. The architecture also supports a dedicated HA-cluster profile for higher-risk customers. A dedicated PostgreSQL instance for every ordinary tenant is not the default: at 1,000 tenants it creates excessive patching, connection, backup and failover risk without automatically preventing application-layer credential misuse.

This decision must be revisited if a threat model, contract or benchmark proves that a shared server process is insufficient.

### Disaster recovery — provisional

- Same-location node/primary failure: RPO 0, RTO <=5 minutes.
- Complete location loss: RPO <=5 minutes, RTO <=4 hours.

The cross-location target is a starting SLO, not a promise, until a full drill proves it on budgeted infrastructure.

### License

Original public core code uses Apache-2.0. It permits commercial use and proprietary applications while adding an explicit patent grant and contribution terms. MIT dependency notices remain intact. Product backends, product-specific components and operational secrets may stay proprietary.

### Network egress

Development agents run default-deny with role-specific allowlists. GitHub, pinned package/container registries, required model endpoints and Tailscale services are allowed only as needed. Research uses a separate worker without repository write tokens or secrets.

## Explicitly unresolved, with gates

| Decision | Resolution gate |
| --- | --- |
| Production Anthropic/OpenAI credentials and billing | Must be resolved before external G5 beta. Headless account sessions cannot pass v1. |
| Exact shared-cluster tenant cap | Derived from connection, backup/restore and noisy-neighbor benchmarks before G6. |
| Dedicated tenant-cluster commercial policy | Product decision; architecture conformance only proves the profile works. |
| Final cross-location RPO/RTO | Adopt provisional target only after a full-location drill and cost review. |
| Runtime secret provider | Select after a v0.2 security spike; interface and behavioral requirements are fixed. |

