# Before pushing

- Review the diff, sibling sites, and independent-review need per the canonical
  evidence sweep (`node_modules/vouchington-tooling/skills/agent-workflow/references/evidence-sweep.md`)
  and review (`node_modules/vouchington-tooling/skills/agent-workflow/references/review.md`).
  For client/API changes, use the relevant [impact recipe](impact-recipes.md).
- Follow the [commit checklist](../../../docs/checklists/commit.md): type-aware lint for changed
  TypeScript and its direct dependents, directly changed tests, scope inspection, and formatting.
  The listed `oxlint-type-aware` gate appends changed files only, so add the dependents yourself;
  CI's whole-repository lint remains the backstop. CI owns full area suites;
  run broader local checks when the change or a failure requires them. List the static gates CI
  will run for the diff with `pnpm exec no-mistakes impacted-checks --generic-only --changed-files
  <manifest>` ([planning § Static gate planning](../planning/references/impact-discovery.md#static-gate-planning)).
- Run the generated-artifact checks that `impacted-checks` lists (catalogs, fixtures, snapshots, selector maps) and regenerate whatever they report stale. CI only catches these after a push.
- When local impact selection fails, diagnose the cause while keeping selection unknown. For invocation failures,
  native CLI reports with `--format json` write an `error` object: exit `75` means `lock_busy` or `lock_timeout`, while exit
  `124` means `deadline`; `error.phase` identifies the interrupted phase. Read the current holder
  without waiting with `pnpm exec no-mistakes lock status --format json` (PID, working directory,
  command, and age when known). Preserve the failed command's stdout, stderr, and exit status; do
  not stop another session's holder or change the configured budgets. The package-owned
  `planning-impact` wrapper uses aggregate failure status and per-report diagnostics instead of
  native CLI exit codes, so inspect those artifacts rather than assuming its status has the same
  meaning. Keep impact selection incomplete until the required reports succeed; an invocation
  failure is not a clean result. See the upstream [invocation contract](https://github.com/jonathanong/no-mistakes/blob/main/packages/no-mistakes/invocation-types.d.ts).
- A change to paid live-provider code (`backend/agents/**` model files, `backend/modules/` provider clients, `backend/services/browser-crawl/**`) dispatches the matching provider and cites the run in the PR: `gh workflow run tests-backend-live-providers.yml --ref <branch> -f provider=<x>`. PR CI no longer runs those checks ([why](../../../docs/development/tests.md#live-provider-smoke-checks)).
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
