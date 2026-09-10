# Third-party notices and process

G0 uses external tools and service images without copying their source into Structile:

| Dependency | Use | License review status |
| --- | --- | --- |
| Node.js | build/runtime foundation | MIT and bundled notices; approved for bootstrap |
| TypeScript | compiler | Apache-2.0; approved |
| React and type declarations | package contract/build typing | MIT; approved |
| PostgreSQL image | mandatory durable database foundation | PostgreSQL License; approved |
| Redis Open Source image | mandatory cache/rate-limit foundation | External service image; license review required before distribution/production release |

## Distributed runtime dependencies

Recorded per OSS-003: every distributed component retains its notice. `pg` is the only direct
dependency declared by `@structile/agent-harness`; the rest enter through it and are distributed
with it. Licences are those each package declares in the pinned lockfile; no source is copied
into Structile.

| Component | Version | Licence | Use |
| --- | --- | --- | --- |
| pg | 8.23.0 | MIT | PostgreSQL driver for the durable checkpointer, task queue and idempotency ledger |
| pg-cloudflare | 1.4.0 | MIT | optional dependency of pg: socket shim for Cloudflare runtimes |
| pg-connection-string | 2.14.0 | MIT | transitive dependency of pg: connection-string parsing |
| pg-int8 | 1.0.1 | ISC | transitive dependency of pg-types: 64-bit integer decoding |
| pg-pool | 3.14.0 | MIT | transitive dependency of pg: connection pooling |
| pg-protocol | 1.16.0 | MIT | transitive dependency of pg: wire-protocol codec |
| pg-types | 2.2.0 | MIT | transitive dependency of pg: result type parsing |
| pgpass | 1.0.5 | MIT | transitive dependency of pg: .pgpass credential file parsing |
| postgres-array | 2.0.0 | MIT | transitive dependency of pg-types: array parsing |
| postgres-bytea | 1.0.1 | MIT | transitive dependency of pg-types: bytea parsing |
| postgres-date | 1.0.7 | MIT | transitive dependency of pg-types: date/timestamp parsing |
| postgres-interval | 1.2.0 | MIT | transitive dependency of pg-types: interval parsing |
| split2 | 4.2.0 | ISC | transitive dependency of pgpass: line splitting |
| xtend | 4.0.2 | MIT | transitive dependency of postgres-interval: object extension |

Every release must generate an SBOM and third-party license report from the exact lockfile and container digests. Distributed notices must be retained. Unknown, source-available, or strong-copyleft production dependencies remain blocked pending explicit human review. Referencing an external development image does not authorize redistributing it.
