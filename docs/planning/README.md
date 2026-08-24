# Planning inputs

The canonical planning documentation for this project lives in
<https://github.com/magnusihle/structile-planning> (`docs/` and `verification/`).
Prose copies are not kept here: duplicated docs drift, and drifted planning
text silently misleads builders.

What this repository does keep locally is hash-pinned by
`architecture/planning-inputs.lock.json` and verified on every run of
`test/planning-import.test.ts`:

- the machine catalogs (`requirements/`, `verification/`) and their validator
  tooling, and
- `decisions-and-assumptions.md` in this directory — the one prose document
  retained because the protected ARCH-001 conformance suite reads it from the
  candidate. Do not edit it here.

The lock records the canonical source commit. To update the pinned set, run
`node tooling/sync-planning-inputs.mjs <this-repo>` from the planning
repository; catalog changes are protected paths and land only through a
human-merged specification-checkpoint pull request.
