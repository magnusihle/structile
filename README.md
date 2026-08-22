# Structile

**The declarative application chassis for SaaS.**

Structile provides the secure structure for authenticated SaaS applications while products assemble their interfaces from reusable, reviewed UI tiles. This repository is the public Apache-2.0 core monorepo.

## G0 status

This repository is in the v0.1/G0 authority bootstrap. It contains package boundaries, governance, frozen development foundations, and the Claude Code/Codex development-adapter contract. It does **not** yet contain the G1 specification/runtime contracts, authentication, tenant routing, query or action execution, Northstar product UI, or customer-facing AI authoring.

The protected conformance authority lives in [`magnusihle/structile-conformance`](https://github.com/magnusihle/structile-conformance). The synthetic reference product lives separately in the private `structile-northstar` repository.

## Workspace

The architecture package names exist from G0 so dependency and ownership boundaries are reviewable. With the exception of `@structile/agent-harness`, packages are intentionally non-functional placeholders until their assigned release gate.

```sh
npm ci
npm run check
```

For the clean Compose foundation, provide the path to a disposable, untracked PostgreSQL secret file:

```sh
STRUCTILE_DEV_POSTGRES_PASSWORD_FILE="$PWD/.local/postgres-password" docker compose up --build --wait
```

Create that file with restrictive permissions and a non-empty local-only value. The file path is ignored by Git; the secret itself is mounted at runtime and is not placed in the Compose environment or image.

PostgreSQL and Redis are reachable only on the internal Compose network. The foundation health endpoint binds to `127.0.0.1:8080`.

## Authority

Implementation agents work through branches and pull requests only. Requirements, protected tests, waivers, conformance inputs, repository rules, signing configuration, and the approved agent/network baseline remain human-controlled.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [GOVERNANCE.md](GOVERNANCE.md).
