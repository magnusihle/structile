# Governance

Structile is currently maintained by Magnus Ihle, who acts as human repository and release authority. Collaborators may receive scoped triage, review, verifier, or implementation roles as the project grows.

## Authority separation

- Maintainers approve architecture and implementation direction.
- Builders propose implementation through branches and pull requests.
- Protected conformance maintainers own test logic, fixtures, thresholds, and runner releases.
- Independent verifiers run protected suites and emit evidence.
- Only the human release authority may merge, approve allowed waivers, apply repository rules, or authorize releases.

No role may use prose, model assertions, or self-authored tests as the sole proof of a mandatory requirement. Changes to requirements, protected verification, agent authority, or release policy use a separate human-owned specification/governance review.

The project intends to keep original public core code under Apache-2.0. Trademark policy and any future legal entity remain separate decisions.
