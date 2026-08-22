# Open-source boundary and governance

## License recommendation

Use **Apache License 2.0** for original core code. It allows commercial use, modification, distribution and proprietary SaaS applications while providing an explicit contributor patent grant. This is more protective for a public platform than MIT without imposing network copyleft on downstream products.

This is architectural guidance, not jurisdiction-specific legal advice. Obtain legal review before accepting substantial outside contributions or using trademarks commercially.

## Public core

- Design tokens, shadcn-based primitives and component registry.
- Declarative specification schemas, restricted query/action contracts and migrations.
- React runtime, composer, chart grammar, localization and accessibility utilities.
- Capability SDK/protocol and reference TypeScript/Node control plane.
- Claude Code/Codex harness, LangGraph workflow, Graphify integration policy.
- Conformance suite, synthetic fixture, threat model, ADRs and infrastructure reference profiles.

## Private/product-owned

- SaaS-specific backends, domain models, data migrations and integrations.
- Product-specific components until intentionally contributed.
- Customer configuration/data, provider credentials, secrets and production inventory.
- Commercial operations, support processes and any future hosted service implementation that is not intentionally contributed.

Apache-2.0 does not require proprietary applications merely using the packages or protocol to be published. Modified/distributed core files must follow the license and NOTICE obligations.

## Dependency policy

- Retain MIT notices for shadcn/ui, LangGraph and other copied/distributed MIT code.
- Generate an SBOM and third-party notices for every release.
- Automated license policy allows approved permissive licenses and blocks unknown, source-available and strong-copyleft production dependencies pending review.
- Do not copy hosted-service code or assets whose license differs from the open-source library.

## Contributions

- `CONTRIBUTING.md`, code of conduct, security policy and governance policy are required before public contribution campaigns.
- Use Developer Certificate of Origin sign-off initially; revisit a CLA only if ownership/commercial strategy requires it.
- CODEOWNERS protect authentication, tenant routing, schemas, migrations, agent policy, conformance tests and release workflows.
- Every contribution links requirements/tests, passes conformance, updates migrations/ADR when contracts change and includes a security assessment for new trust boundaries.

## Release integrity

- SemVer packages, generated changelog and compatibility matrix.
- Signed source tags, npm provenance where available, signed OCI images and published checksums.
- Reproducible build target, SBOM, vulnerability report and third-party notices.
- Deprecation notice before removing N-1 schema support.
- Security disclosure channel and supported-version policy.

## Trademark

Apache-2.0 does not grant trademark rights. Keep project name/logo policy separate so others may fork and sell compliant software without implying endorsement or using protected branding deceptively.

