# Implementation

- Apply the canonical workflow and only the relevant local workspace and authoring skills.
  Keep changes within the accepted task; reproduce a newly found blocker against current main
  before proposing a scope change.
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
- Run relevant tests and the repository's required checks. Report skipped or blocked checks with
  evidence; do not hide failures with retries, timeouts, or suppressions. Commands and CI ownership
  live in [tests](../../../docs/development/tests.md) and [CI](../../../docs/development/ci.md).
- Keep delivered code and tests complete. Temporary authoring scaffolding must not survive the
  final diff; legitimate test doubles remain governed by the owning test skill.
- Before deleting a deadline, supply a replacement bound or prove and test that all callers supply
  one. When changing a policy/parity table, reconcile contradictory sibling rows.
- Resolve cross-repository deferral targets to their live canonical identity. File follow-ups only
  within the current task's issue-filing authority; otherwise report a recommendation.
- For frontend work, perform the relevant [local](../local-site-testing/SKILL.md) or
  [staging](../staging-qa/SKILL.md) validation. Keep the results separate:
  `Visual verification:`, `Automated browser tests:`, and `Screenshot attachment:`.
  Missing upload credentials do not imply visual QA failed; a browser failure cannot be replaced
  by a passing unit test. Record material changes to accepted verification with the saved plan.
- Record consequential friction and validation failures through [blackboard](../blackboard/SKILL.md).
  Before reporting completion, check the final diff against the accepted task and observed evidence.
