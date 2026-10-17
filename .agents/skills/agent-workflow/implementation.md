# Implementation

Follow the canonical implementation (`node_modules/vouchington-tooling/skills/agent-workflow/references/implementation.md`)
and evidence sweep (`node_modules/vouchington-tooling/skills/agent-workflow/references/evidence-sweep.md`)
references (behavior-change updates, semantic conflict resolution, deadline removal, policy-table
siblings, skipped-validation findings, final-diff comparison). Vouchington additions:

- Apply only the relevant local workspace and authoring skills. Reproduce a newly found blocker
  against current main before proposing a scope change.
- Preserve Voucha's [one current contract](../../../AGENTS.md). For storage, use the
  [relational schema policy](../../../docs/development/postgres-schema-rules.md#prelaunch-relational-storage).
  For user/staff surfaces, follow the [client parity matrix](../../../docs/requirements/CLIENT-PARITY-MATRIX.md)
  and the relevant [impact recipe](impact-recipes.md).
- Keep behavioral docs and owning catalogs current. Explanations belong in `docs/**`; procedures
  belong in skills; directory invariants belong in `AGENTS.md`. Follow [placement](../../../docs/AGENTS.md).
- Select coverage with [test value](../../../docs/development/reference-tests-value-and-reduction.md)
  and the owning test-authoring skill. Add a focused regression test when one is needed; prove the
  failure before the fix. Documentation and mechanical edits do not require invented tests.
- Use the test skill that owns the boundary: [backend](../backend-vitest-test-authoring/SKILL.md),
  [non-web Vitest](../vitest-test-authoring/SKILL.md), [web Vitest](../web-vitest-test-authoring/SKILL.md),
  [Playwright](../playwright-authoring/SKILL.md), or [Storybook](../storybook-authoring/SKILL.md).
  Do not copy mock, fixture, or locator rules into general workflow guidance.
- Commands and CI ownership live in [tests](../../../docs/development/tests.md) and
  [CI](../../../docs/development/ci.md). Do not hide failures with retries, timeouts, or suppressions.
- Temporary authoring scaffolding must not survive the final diff; legitimate test doubles remain
  governed by the owning test skill.
- Resolve cross-repository deferral targets to their live canonical identity. File follow-ups only
  within the current task's issue-filing authority; otherwise report a recommendation.
- For frontend work, perform the relevant [local](../local-site-testing/SKILL.md) or
  [staging](../staging-qa/SKILL.md) validation. Keep the results separate:
  `Visual verification:`, `Automated browser tests:`, and `Screenshot attachment:`.
  Missing upload credentials do not imply visual QA failed; a browser failure cannot be replaced
  by a passing unit test. Record material changes to accepted verification with the saved plan.
- Record consequential friction and validation failures through [blackboard](../blackboard/SKILL.md).
