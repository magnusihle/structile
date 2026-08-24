# Structile implementation authority

## Scope

Implement G0/v0.1 only until a human explicitly assigns a later gate. Read `docs/planning/decisions-and-assumptions.md` (the hash-locked local copy) and, in the canonical planning repository <https://github.com/magnusihle/structile-planning>, `docs/architecture.md`, `docs/security-threat-model.md` and `docs/release-gates.md` before implementation work. `docs/planning/README.md` explains the pinning.

## Protected inputs

Do not change `requirements/**`, `verification/test-catalog.json`, `verification/evidence.schema.json`, waiver state, conformance fixtures/goldens/thresholds, repository rules, signing configuration, or the approved files under `policies/agent/**` in ordinary implementation work. A mismatch is a specification checkpoint, not permission to reinterpret the plan.

## Authority

Agents may create implementation branches, commits, and pull requests. Agents may not merge, deploy production, approve waivers, change repository protections, sign releases or evidence, or receive production credentials or customer data.

The G0 bootstrap may propose the initial `policies/agent/**` baseline. Humans review and apply it; after approval it becomes protected.

## Required checks

Run:

```sh
npm ci
npm run check
node --test tooling/test/*.test.mjs
node tooling/validate-planning.mjs
```

Then run every protected G0 suite using the pinned `structile-conformance` runner. Local candidate tests are informative and cannot replace protected evidence.

## Stop conditions

Stop for a specification checkpoint if work is ambiguous, contradictory, requires a protected change, or crosses into G1+. Stop after opening or updating the pull request for human review.
