# Responsibility boundaries

The platform must make common concerns reusable without pretending that unrelated products share business logic.

| Concern | Public platform core | SaaS product | Tenant configuration | AI may change |
| --- | --- | --- | --- | --- |
| Design tokens/primitives | Owns schema and defaults | Selects product theme | Logo/accent within limits | Draft allowed values only |
| Component catalog | Owns core catalog | Adds trusted reviewed components | Cannot add executable types | Select/configure registered types |
| Routes/pages/layout | Owns spec grammar/runtime | Defines initial specs | Personal/shared drafts per role | Draft specs |
| Authentication | Better Auth/OAuth policy | Provider credentials/domains | Admin restrictions | Never |
| Roles | Fixed four roles | Maps permissions | Assigns roles | Never |
| Tenant routing | Control-plane contract | Operates tenant databases | None | Never |
| Domain data/model | No knowledge | Fully owns | Uses through product permissions | Never defines schema |
| Metrics/filters/queries | Safe AST and protocol | Implements capabilities | May narrow manifest | Compose allowed fields only |
| Relationships | Protocol | Explicitly declares/implements | May disable | Cannot infer new joins |
| Exports | Guardrails/jobs/audit | Supplies data | Uses if permitted | May draft export component, not execute |
| Actions | Protocol, risk and audit | Implements business action | Uses if permitted | May reference in draft only |
| Integrations/jobs | Generic job envelope only | Fully owns | Product-defined | Never invents implementation |
| PostgreSQL | Operational/security contract | Owns domain migrations/data | Residency/retention policy | Never accesses directly |
| Redis | Cache/rate-limit contract | Chooses cache keys/TTLs | None | Never accesses directly |
| Deployment | Docker/Compose/HA conformance | Supplies product config | None | Development agent may propose PR only |
| Observability | Redaction and SLO contract | Implements domain metrics | Retention policy | Never receives raw traces |

## Prohibited generalization

The core must not contain ERP-specific concepts, customs/declaration concepts, product workflows, document parsing rules, email automations, accounting rules, product-specific database columns or integration credentials. If a capability appears in only one product, it remains in that product until at least two products demonstrate a stable, security-reviewed abstraction.

## Product extension rule

A product-specific component is normal trusted source code. It must register:

- A stable component ID and owner.
- Prop/slot schema with bounded data sizes.
- Accessibility contract and visual fixtures.
- Data/query requirements and required permissions.
- Allowed actions and event outputs.
- Loading, empty, forbidden and error states.
- Version and migration policy.

Tenant authors and AI cannot create or load executable component code. “New type without deployment” means a saved composition of registered primitives or a novel specification in the restricted chart grammar.

## Control-plane boundary

The standardized TypeScript/Node control plane does not violate backend language independence. It handles only platform concerns. A Python, Go, Java, Rust or other project backend implements the same HTTP capability protocol and remains responsible for every domain decision.

## Reuse rule

Reuse is achieved through packages, schemas, generated clients, conformance tests and starter deployment profiles. It is not achieved through a shared production database, cross-product service dependency or copying an entire previous product repository.

