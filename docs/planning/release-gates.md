# Staged delivery and release gates

Versions are checkpoints, not calendar promises. A later stage cannot waive an earlier gate. Exact acceptance is defined by `requirements/requirements.json` and `verification/test-catalog.json`.

| Version | Gate | Deliverable | Exit condition |
| --- | --- | --- | --- |
| v0.1 | G0 — authority | Public repo layout, Apache-2.0 boundary, requirement catalog, protected conformance runner, Claude/Codex adapters, branch/PR-only permissions | Meta-validation passes; builder cannot mutate protected requirements/tests or merge. |
| v0.2 | G1 — contracts | Tokens, primitives, catalog, specification schemas, capability protocol, N/N-1 policy, package signing/versioning; durable LangGraph harness | Contract/fuzz tests pass; crash/resume and human interrupt produce equivalent evidence. |
| v0.3 | G2 — isolation | Better Auth Google/Microsoft OAuth, invitations, roles, product control DB, tenant database provisioning/routing, audit, Redis rate-limit contract | Cross-tenant matrix/property tests show zero unauthorized reads/writes; OAuth/session abuse tests pass. |
| v0.4 | G3 — read-only runtime | Catalog-only React renderer, routes/pages/nav, charts/tables/filters, safe query AST, manual draft/preview/publish/rollback | Invalid specs never render; raw SQL/code/network references rejected; read-only capability tests pass. |
| v0.5 | G4 — conformance application | Clean synthetic “Northstar Operations” fixture, admin/settings views, localization, themes, bounded CSV/XLSX exports, design/accessibility/visual tests | Functional, structural and design parity pass without product-specific React pages; export abuse tests pass. |
| v0.6 | G4A — actions | Previously specified action protocol execution, forms, record mutations, async job state | Read-only gate remains green; preview/idempotency/concurrency/reauth/audit tests pass; mutations cannot escape declared records. |
| v0.7 | G6A — scale/reliability | Multi-node app, PostgreSQL HA, Redis HA/degradation, WAL/restore, backup, Tailscale management isolation, self-hosted observability | Certified load/SLO and component/host/primary failure drills pass. Provisional cross-location target is tested. |
| v0.8 | G5A — text authoring | Anthropic/OpenAI adapters, permission-filtered context, text-to-spec drafts, eval corpus and explicit publish | Zero unauthorized publication; all outputs pass deterministic validators; semantic task thresholds pass. |
| v0.9 | G5B/G6 — screenshot and production RC | Screenshot-to-spec, visual scoring, production service credentials, supply-chain signing, penetration/fuzz/load/DR evidence | Headless sessions removed from customer endpoint; security and full-location drill pass; release evidence complete. |
| v1.0 | All | Stable public core and reference deployment profile | Every mandatory requirement has fresh evidence for the exact release commit; no expired/forbidden waiver. |

## Gate rules

1. A gate is evaluated against an immutable candidate commit and pinned conformance-runner image digest.
2. All mandatory tests must emit evidence; absence, skip, timeout or infrastructure error is failure.
3. Builders cannot change requirement IDs, protected test logic, expected golden files, thresholds or waiver state in implementation PRs.
4. An independent verifier reruns security, cross-tenant, migration, AI authorization and DR suites.
5. A human release authority may approve an allowed, expiring waiver but cannot waive tenant isolation, credential exposure, arbitrary code execution, authorization or evidence-integrity requirements.
6. G5 is ordered after G4 so AI cannot hide gaps in the deterministic runtime.

## Reference fixture rule

`toll-refundering` is not a conformance fixture and no code is copied from it. It served only to demonstrate the needed class of frontend: multiple routes, KPIs, filters, grouped/flat data tables, charts, expanded rows, themes/locales and exports. The synthetic fixture in `verification/reference-fixture.md` is built cleanly from the platform contracts.

