# Before pushing

- Review the diff, sibling sites, and independent-review need per the canonical
  evidence sweep (`node_modules/vouchington-tooling/skills/agent-workflow/references/evidence-sweep.md`)
  and review (`node_modules/vouchington-tooling/skills/agent-workflow/references/review.md`).
  For client/API changes, use the relevant [impact recipe](impact-recipes.md).
- Follow the [commit checklist](../../../docs/checklists/commit.md): type-aware lint for changed
  TypeScript, directly changed tests, scope inspection, and formatting. CI owns full area suites;
  run broader local checks when the change or a failure requires them. List the static gates CI
  will run for the diff with `pnpm exec no-mistakes impacted-checks --generic-only --changed-files
  <manifest>` ([planning § Static gate planning](../planning/references/impact-discovery.md#static-gate-planning)).
- Changes to manifests also follow [package metadata](../package-json-checklist/SKILL.md).
  Changes to guards follow [static analysis](../static-analysis-checklist/SKILL.md).
- Verify claimed commands, paths, external references, and CI behavior against their actual owners.
  Close issues only when the change meets their remaining acceptance criteria.
- Before final validation, inspect scope against current `origin/main` and rebase unstacked work
  with `./dev/rebase-onto-main`; use `./dev/rebase-onto-main --stack` or `gh stack sync` for native
  stacks. Re-derive stack topology and rerun affected checks after semantic conflict resolution.
  The helper's protected-checkout refusal is intentional; see [Git and PRs](git-and-prs.md).
- If upstream changes package manifests or the lockfile, run `pnpm install` before later pnpm
  commands. See [dependency policy](../../../docs/development/dependency-updates.md).
- Treat CI failures as potentially related until evidence says otherwise. Use
  [review-ci-logs](../review-ci-logs/SKILL.md) and the
  [transient-retry catalog](../../../ci/transient-retry/README.md) before retrying.
  Voucha's patch-coverage gate blocks; informational Codecov upload status does not replace it.

- For an upper-only fast-forward while a lower layer is queued, follow [the forge check](../stacked-prs/SKILL.md#upper-only-fast-forward): capture the parent head/base, upper remote head, and stack order; reread all four immediately before pushing. Require unchanged refs, a fast-forward upper commit, and parent ancestry. On a mismatch, merge, or queue exit, stop and reread. Do not sync or rebase the stack while the lower layer is queued; read-only review and CI work can continue.
