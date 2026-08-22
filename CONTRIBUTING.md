# Contributing to Structile

Structile is in a protected bootstrap phase. Discuss substantial changes before implementation and keep each pull request tied to explicit requirement and protected-test IDs.

## Workflow

1. Create a branch from the protected base.
2. Change only implementation-owned paths assigned to the task.
3. Add implementation-owned tests and run `npm run check`.
4. Run the protected conformance suites assigned to the requirements.
5. Open a pull request listing requirement IDs, protected test IDs, exact candidate commit, risks, migration/rollback notes, and evidence artifacts.
6. Stop for human review. Contributors and agents do not merge their own work.

Protected requirements, tests, goldens, thresholds, waivers, repository rules, release-signing workflows, and approved agent/network policies require a separate human-owned specification or governance change.

Contributions use Developer Certificate of Origin sign-off (`git commit -s`). A code of conduct applies to all project spaces.
