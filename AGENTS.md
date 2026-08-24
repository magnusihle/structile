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

## Presentation gate

No pull request is opened, updated or presented to the human until every check below has run and passed (`docs/delivery-operating-model.md` section 6 in the canonical planning repository, <https://github.com/magnusihle/structile-planning>, is normative):

1. This repository's own candidate checks pass locally, using the same commands its CI runs (the Required checks above). A red first CI run on a pre-existing check is a loop failure.
2. The committed diff from the merge-base is reviewed file by file and its manifest matches the declared scope exactly. Bulk staging (`git add -A`) is forbidden; every path is staged explicitly.
3. Size ceilings hold: gross churn at most 500 lines and 10 files (targets 200/5), and vendored or pinned content passes its checksum verification where present.
4. The full diff contains no undeclared files, secrets, NUL bytes or undeclared TODO/FIXME markers, and every new user-facing entry point has been executed at least once for real.
5. An independent verifier context that did not author the change re-runs checks 1–4 adversarially, with a mandate to refute readiness, and issues a verdict. Verifier agents run on an economical model (Sonnet-class or cheaper), never a frontier model. One verifier pass per PR; a trivial delta provable by diff-stat plus green CI needs no fresh round.
6. The report presenting the PR quotes tool and verifier output verbatim. A prose claim of verification with no attached output is void.

## Stop conditions

Stop for a specification checkpoint if work is ambiguous, contradictory, requires a protected change, or crosses into G1+. Stop after opening or updating the pull request for human review.
