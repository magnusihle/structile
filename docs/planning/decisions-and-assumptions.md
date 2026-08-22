# Decisions and assumptions

This file records answers approved during scope discovery. Technical assumptions marked **provisional** must be proved or rejected by a spike or failure drill; builders may not silently reinterpret them.

## Locked product decisions

| Area | Decision |
| --- | --- |
| Delivery | Complete v1 requirements staged across v0.1–v1.0. |
| Authoring order | Deterministic manual/specification runtime first; AI authoring at G5. |
| Actions | Specify the protocol now; execution begins only after read-only tenant isolation passes. |
| Reference | Do not reuse `toll-refundering` as a code fixture. It was only a capability example. |
| Recreation | Functional, structural and design-system parity are required. Screenshot-to-spec arrives at G5. |
| Scale | Certify one deployed product for 1,000 tenants, 10,000 active users and 1,000 concurrent sessions. |
| SLO | At certified load: p95 platform reads <=150 ms, writes <=300 ms, dashboard usable <=1.5 s. |
| Authentication | Better Auth; Google and Microsoft OAuth only. No username/password or public self-signup. |
| Provisioning | Tenants through a trusted developer/API path; membership by invite. |
| Identity policy | A tenant may restrict Google Workspace domains or Microsoft Entra tenant IDs. |
| Membership | One user may belong to multiple tenants. |
| Roles | Fixed owner/admin/editor/viewer roles mapped to product-defined permissions. |
| Publishing | Users publish personal dashboards; tenant admins publish shared dashboards. |
| UI scope | Authenticated application, administration and settings pages. Public/SEO/embed surfaces are out of v1. |
| UI technology | React and TypeScript are mandatory; project-specific backends may use any language. |
| Distribution | Versioned runtime packages and component registry installed and pinned in each product. |
| Extensions | Trusted product-specific components require code review and deployment. No tenant JavaScript. |
| Devices | Desktop conformance only in v1. Tablet/mobile are explicitly out of scope. |
| Localization | Locale-aware dates, numbers, currencies/time zones; product translation catalogs and switching. No RTL requirement. |
| Branding | Product tokens, limited tenant logo/accent overrides, user light/dark mode. |
| Compatibility | Runtime supports current and previous major UI specification versions with migration and rollback. |
| Data exposure | Developers define the maximum capability surface; tenant admins may only restrict it. |
| Queries | Joins only through backend-declared, authorized relationships. No raw SQL or inferred joins. |
| Exports | Audited, permission-checked CSV/XLSX with row/byte/time limits. |
| Privileged auth | Recent OAuth reauthentication for publishing, exports and mutations; optional upstream MFA requirement. |
| Audit | One-year default retention, configurable from 90 days to seven years. |
| Mutations | Risk-based preview; reauthentication for deletes, bulk and high-impact actions. |
| Database | PostgreSQL is mandatory. Each tenant receives a separate logical database and role. |
| Control data | One control-plane database per SaaS product; never one global database coupling all products. |
| Cache | Redis is mandatory for caching/rate limiting but never a durable source of truth. |
| Packaging | Docker and Docker Compose are mandatory developer/deployment artifacts. |
| Hosting | Coolify on Hetzner; Tailscale is the private management plane. |
| Failure target | Component, host and primary database failure recovery under five minutes. |
| Data loss | Local primary failover targets RPO 0. |
| Agents | Claude Code and Codex supported from day one. |
| Agent authority | Branch and pull request only; never merge, production deploy, requirement-test edits or waiver approval. |
| Harness runtime | Developer workstations and private self-hosted CI runners. |
| Harness behavior | Durable resume, long-lived human interrupts, multi-agent fan-out/fan-in and persistent scheduling. |
| AI providers | Anthropic and OpenAI behind a provider-neutral adapter. |
| AI context | Capability metadata plus user prompt/screenshots; no live customer records by default. |
| AI credentials | Headless sessions allowed only for private prototypes/harness. Production service credentials remain a release blocker. |
| Observability | External telemetry disabled by default; secrets and raw customer data are prohibited from all telemetry. |
| Open source | Design system, runtime, schemas, SDKs, reference control plane, agent harness and conformance suite. |
| Residency | Selected independently by each SaaS product and enforced consistently across primary, replicas, backups and logs. |

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

