---
name: structile-authority
description: Non-negotiable authority, evidence and protected-path rules for the Structile workspace (structile, structile-conformance, structile-northstar). Load before creating branches, commits or pull requests in any of these repos, before touching requirements, conformance suites, fixtures, policies or workflows, and before making any statement about whether a release gate has passed.
---

# Structile authority rules

Read `AGENTS.md`, `workspaces/structile/AGENTS.md` and `docs/planning/release-gates.md` for the
full text. This is the operative summary.

## What an agent may never do

Create branches, commits and pull requests — yes. Never: merge, deploy production, approve
waivers, change repository protections or rulesets, sign releases or evidence, or receive
production credentials or customer data.

These are not conventions. `policies/agent/permissions.json` lists `push-default-branch`,
`merge`, `deploy`, `write-protected`, `alter-rules`, `approve-waiver`, `sign-evidence` and
`read-production-secret` as denied, and the protected **HAR-003** suite actively probes that each
attempt is denied and audited. Performing one either fails or proves the control is fake.

## Protected paths

Never modify in ordinary implementation work (`policies/agent/protected-paths.json`):

```
requirements/**                     verification/test-catalog.json
verification/evidence.schema.json   verification/fixtures|goldens|thresholds/**
requirements/waivers.json           .github/CODEOWNERS
.github/rulesets/**                 .github/workflows/release-signing*.yml
policies/agent/**
```

Protected **conformance suite source** in `structile-conformance` is equally off limits: it may
only be authored or changed through a human-owned PR. Draft it as a reviewable proposal under
`workspaces/*-proposal/` and hand it over; never commit it yourself.

A mismatch between the plan and reality is a specification checkpoint, not licence to
reinterpret. Stop and ask.

## Never claim a gate passed

A gate passes only when the **protected conformance runner** emits evidence matching
`verification/evidence.schema.json`, bound to the exact candidate commit and the attested runner
digest, from the protected workflow.

Local runs and ordinary candidate CI are **informative only**. Locally emitted envelopes carry
`measurements.localUnsigned: true` and
`provenance.workflowIdentity: local-unsigned/not-release-evidence`. Say so every time you report
one. A passing local suite means the implementation looks right; it is not evidence.

Never write "G1 passed", "gate green" or similar without a protected envelope to point at. State
which requirements remain unevidenced and why.

## Gate order

G0 authority → G1 contracts → G2 isolation → G3 read-only runtime → G4 fixture → G4A actions →
G6A scale → G5 AI → v1.0. A later stage cannot waive an earlier gate. Do not start work for a
gate whose predecessor lacks protected evidence, and do not begin a tranche whose protected
suites do not yet exist as merged, runnable source.

## Current state

G0/v0.1 **passed** 2026-08-23 — core candidate `545a7664cc455c273837e14ba42b262913c765e7`,
conformance authority `d6a58deb1fabb539b6f7d9fd930512ade3522611`, runner
`sha256:c3732dc2fe1991f9b26e5107a311744507f8a34e67bb646dcbee9adb4ffd290c`. Six envelopes,
both Sigstore attestations verified.

G1 is **not** passed. Four of its ten suites exist only as an unmerged proposal
(`workspaces/g1-protected-suites-proposal/`); PKG-001, A11Y-001, SPEC-002, SEC-005, HAR-002 and
HAR-004 are unimplemented.

## PR requirements

Every PR body names: requirement IDs, protected test IDs, the exact candidate commit, and the
evidence status — including what remains unevidenced. Open as **draft** while the protected
suites backing it are unmerged. Stop after opening or updating the PR; a human holds merge and
release authority.
