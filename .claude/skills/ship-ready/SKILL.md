---
name: ship-ready
description: Converge changed code to a shippable state before reporting a task complete. Run this after writing or modifying any code in this workspace — before opening a PR, before saying "done", and before any completion summary. Repeat review passes until one pass makes ZERO changes; that no-op pass is the only valid stopping condition. Also use when asked to review a PR, check whether code is ready to merge, or harden an implementation.
---

# Ship-ready convergence loop

Code in this workspace is held to a strict bar before it is pushed. "I reviewed it" is not a
stopping condition — three consecutive review passes on one small package each found real
defects, and one of them was introduced by the previous pass's fix.

**Stop only when a full pass makes no changes.** Report the pass number at which that happened.

## Loop protocol

```
pass = 1
loop:
  run every gate in "Gates" below
  if any gate produced a change (code, test, or doc):
      record what changed and why
      pass += 1
      goto loop            # a fix can introduce a defect; the next pass must be full
  else:
      converged at pass N -> report and stop
```

Never shorten a later pass because earlier passes were clean. A fix invalidates prior results.

### 0. Is your picture of the world still true?
Before the first pass, re-check external state rather than assuming it survived from last
time: `git fetch --prune`, the current base branch, whether earlier PRs in the stack were
merged or squashed, and whether any branch has gone stale. A branch here sat silently
`CONFLICTING` because an earlier PR had been squash-merged and the stack was never rebased.

**Converge the stack, not the branch.** When PRs are stacked, a fix in the newest one rebases
onto the others and can mask their probes. Measure every package in the stack from its tip,
not each branch in isolation.

## Gates

Run all of these each pass. Each is a question with an empirical answer, not a judgement call.

### 1. Does it build and pass its own checks?
Run the repository's full check command (for `workspaces/structile`: `npm ci && npm run check`).
Read the **whole** output, not a grepped tail — a narrow grep once hid a failing test here.
Zero failures, zero type errors.

### 2. Do the tests actually test anything? (mutation)
For each guard, validator, limit or branch the change introduces: **delete or neuter it, rebuild,
and confirm a test fails.** If everything still passes, the test is decorative.

Automate it where the surface is large. `workspaces/g1-protected-suites-proposal/verification-harness/`
holds a working campaign: it neutralises every guard one at a time and reports a mutation score.

### 3. Is any passing test masked?
A test can pass for a reason unrelated to what it claims to check. **This is the dominant
failure mode in this workspace** — it recurred three times in one small package, once
introduced by the previous pass's own fix. Treat it as the default suspicion, not an edge case.

**The rule: choose an input for which the constraint under test is the ONLY thing that can
reject it.** Concretely, before writing a negative probe, ask which *other* validation would
also reject this input. If any would, the probe proves nothing.

Worked examples from this workspace, all real:
- A forbidden-value probe used a colour token, so the `#rrggbb` grammar rejected the payload
  whether or not the forbidden-value scan existed. Deleting the entire scan still passed.
- A length-bound probe used `TOKEN_IDS[0]` — also a colour token — so the same grammar masked
  it. Fix: probe a deliberately free-form token where only the length check applies.
- A prototype-pollution probe used a page with no `nodes`, so it was rejected for
  "nodes must be an array". Deleting the pollution check still passed.

Also required:
- Every negative assertion needs a **paired control**: assert the un-poisoned input is *accepted*
  before asserting the poisoned one is rejected. Build a helper that enforces this so it cannot
  be forgotten.
- When a test fails, **read the failure reason**. A test that fails for the wrong cause is not
  evidence the probe works. A mutation test here once looked "killed" because the run died
  earlier at an unrelated missing module; on a complete candidate the mutant survived.
- Where a contract has several validation layers, probe **every category or branch**, not the
  first one. Whichever layer is permissive is where the check you care about is load-bearing.

### 4. Is the defect a class or an instance?
When a defect is found, search for every other occurrence of the same shape before moving on.
This has bitten twice here: a schema/validator divergence was fixed on one field while the
identical divergence on `version` survived to the next pass; a raw-`TypeError` leak was fixed in
`contrastRatio` while `tokenCategory` kept leaking one.

Practical form: after each fix, write a probe that sweeps the **whole** exported surface or
**every** schema constraint, rather than re-testing the single case you just fixed.

### 5. Is it duplicated, or does it already exist?
Declining to deduplicate is a valid outcome; leaving it unexplained is not.
- Search the workspace for existing helpers, types and validators before adding new ones.
- Two near-identical implementations are a defect even when both are correct.
- Prefer extending a generic contract over adding a parallel special case.
- If the same logic now exists in two packages, extract it or justify the duplication in a comment.

### 6. Does it match the surrounding code?
Match the idiom of the package being edited, not a general preference: import specifiers,
error-handling shape, test layout, comment density, naming. In this workspace specifically —
hand-written validators over new dependencies; JSON Schema normative with TypeScript mirroring it;
typed atomic rejection carrying the full violation list, never a raw `TypeError`; validators
return a detached, frozen copy rather than aliasing untrusted input.

### 7. Is the public surface honest?
- Does the validator enforce exactly what the published schema declares? Check
  `additionalProperties`, `required`, `minimum`, `enum` — divergence here is a real bug, because
  the schema is the contract other languages implement.
- Are exported constants deep-frozen? A frozen array of mutable objects is not a contract.
- Are versioned inputs gated, failing closed on an unreadable version?
- Are numeric inputs bounded? Well-formed and absurd is still invalid.
- Does every exported function reject bad input with the package's typed error?

### 8. Dead code, leftovers, and what your edit destroyed
No unused exports, unused imports, stray duplicate files, debugging scaffolding, or
commented-out blocks. Check what the change *added* and what it *orphaned*.

**A rising test count is not evidence that tests were added.** A slice-replacement here
deleted three working tests while adding four; the suite still went 61 -> 69 and `npm run
check` stayed green. Only a *falling mutation score* exposed it. After any edit to a test
file, diff it (`git diff -- <file> | grep '^-test('`) and confirm nothing was removed.

### 9. Do the semantic invariants hold? (no schema encodes these)
Gates 1-8 are mechanical: mutation, differential and boundary testing. They cannot see code
that is internally consistent and *semantically wrong*. On this workspace the mechanical gates
converged clean on a package that still had two real defects, found only by asking these
questions. Run this gate deliberately, every pass.

Ask, for the domain at hand:
- **Ordering** — should related values be monotonic or ranked? Is a "raised" surface actually
  lighter than the page? Is `primary` stronger than `secondary` stronger than `disabled`? Compute
  the ordering and assert it; do not eyeball it.
- **Distinctness** — is anything identical that must be distinguishable? An overlay equal to the
  page behind it is invisible. Two states rendering the same value are indistinguishable to a user.
- **Parity across variants** — do light/dark, sync/async, or read/write paths behave *structurally*
  the same way? A relationship that inverts between variants is almost always a bug in one of them.
- **Completeness of hand-written lists** — any curated list (declared pairs, allow-lists, fixtures)
  omits cases the runtime will still hit. Enumerate the cross product and check that instead, or
  assert the list covers it. A hand-written list of 19 pairs here left 18 real combinations
  unprotected.
- **Round-trip and idempotence** — does validating a validated value still succeed and return the
  same thing?

Turn each answer into a property test so the invariant is enforced, not merely observed once.

### 10. Is your own tooling lying to you?
Ad-hoc harnesses produced confident, wrong results five separate times in one session:
`if (false && A || B)` still fired because of operator precedence; a mutant was routed to a
suite that did not cover it; an `argv` off-by-one made every probe call `undefined()` and
report `TypeError`, which nearly passed as proof of equivalence; a loop dropped its arguments
so suites ran with no flags; a mutation run "failed" for an unrelated missing module.

Before trusting any harness result: run it against a **known-good** and a **known-bad** input
and confirm it distinguishes them. If every case returns the same answer, suspect the harness
before the code.

## Reporting

State the pass count and what each pass changed. Do not describe the code as clean, solid or
ready in an earlier pass — that claim is only earned by the no-op pass. If a defect was
introduced by an earlier fix in the same task, say so explicitly.

If you stop before convergence — budget, a blocking question, an external dependency — say which
gate you stopped at and what remains unverified. Never present an unconverged loop as finished.
