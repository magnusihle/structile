# Third-party notices and process

G0 uses external tools and service images without copying their source into Structile:

| Dependency | Use | License review status |
| --- | --- | --- |
| Node.js | build/runtime foundation | MIT and bundled notices; approved for bootstrap |
| TypeScript | compiler | Apache-2.0; approved |
| React and type declarations | package contract/build typing | MIT; approved |
| PostgreSQL image | mandatory durable database foundation | PostgreSQL License; approved |
| Redis Open Source image | mandatory cache/rate-limit foundation | External service image; license review required before distribution/production release |

Every release must generate an SBOM and third-party license report from the exact lockfile and container digests. Distributed notices must be retained. Unknown, source-available, or strong-copyleft production dependencies remain blocked pending explicit human review. Referencing an external development image does not authorize redistributing it.
