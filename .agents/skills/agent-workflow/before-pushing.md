## Before Pushing

Before the first push of a PR, complete the local self-review in [Code Review](code-review.md#local-self-review) and fix any blocking correctness, security, or plan-adherence findings.

For work that starts from an accepted plan, turn the plan into a pre-first-push evidence sweep before relying on CI or bot review:

1. List every named surface, component, endpoint, queue, native client, fixture, authorization rule, lifecycle state, and acceptance criterion from the accepted plan.
2. For each item, record one concrete evidence artifact before pushing: an exact `rg`/`no-mistakes` result, a focused test command and result, a rendered/browser behavior check, a fixture regeneration/check, or verified external state.
3. Convert every chosen prop, field, route, queue job, SQL column, enum value, permission name, and user-visible label from the plan into a search assertion across declarations and every JSX/call/write site. Classify each remaining match as intentionally unchanged, updated, or incomplete, and fix incomplete matches before pushing.
4. When the work touches the "feature surfaces move together" rule, run the [Cross-Surface Contract Matrix](impact-recipes.md#cross-surface-contract-matrix) recipe. The evidence must cover routes, authorization, read-after-write freshness, deletion/export or lifecycle cleanup, fixtures, and web/Swift/.NET UI states as applicable.
5. When an endpoint or host changes, complete the [Endpoint Migration](impact-recipes.md#endpoint-migration) recipe, including reader-writer, deploy-order, and rollback evidence.

When self-review or any bot/human review flags one instance of a semantic bug pattern, do a sibling-call-site sweep before pushing the fix. Search every sibling site added or touched by the PR for the same shape, not just the exact symbol. Common shapes include stale enqueue-time payload values instead of worker-time re-fetches, missing lifecycle-state or soft-delete filters, OAuth-only recipient gaps, unbounded time windows, authorization predicates applied to one route but not its sibling, and guards present on a primary `INSERT`/`UPDATE` but missing from an `ON CONFLICT DO UPDATE` or other secondary write path. Record the sweep query and why any remaining sibling match is safe.

Then run only these cheap local commands. GitHub Actions is the full gate. Do not run `pnpm run no-mistakes`, Knip, typecheck-\*, dep-cruise, Playwright, native harnesses, or any deleted local suite as a before-push requirement. Reproduce a CI failure from [tests.md](../../../docs/development/tests.md) and [ci.md](../../../docs/development/ci.md).

1. `pnpm exec oxlint --deny-warnings --type-aware <changed TS/MTS files>` — catches import order violations and missing `vi.fn` type parameters that bot reviewers flag on almost every PR where they appear.
2. `pnpm exec vitest run <directly changed test files> --bail=3` — run the test files you edited. CI runs the full suite of each touched area; reproduce one with `pnpm exec vitest run --project <project>`.
3. `git diff --name-only origin/main...HEAD` — scope check; if the file list is unexpectedly large for the PR's intent, investigate before pushing.
4. `pnpm exec oxfmt --check <changed supported files>` — catches formatting in docs (`.md`), workflows (`.yml`), and config (`.toml`) that the TypeScript-only check misses.

Before pushing docs/comments that name source symbols, external URLs, line numbers, directory paths, or CI-gate status, verify each claim with the source of truth (`rg`/symbol search, `curl -I` or a live visit, `ls`/`find`, `.github/workflows/`).

Also verify `Closes #N` entries in the PR body are accurate — a premature `Closes` silently drops unfinished work when GitHub auto-closes the issue on merge.

For parser, scanner, guardrail, and security-command-parser PRs, run a local security review before the first push. Use the `security-review` flow when available, or the public `security-triage` plugin when the work starts from Codex Cloud findings; record the exact local review command/result in the PR notes. Do this before pr-shepherd or external bot review so adversarial and variant coverage gaps are fixed locally.

Before the final validation pass and push, run `git fetch origin` and inspect `git diff --name-only origin/main...HEAD` for unexpected scope. Rebase an unstacked PR with `git rebase origin/main`. Rebase a stacked PR with `gh stack rebase` or `gh stack sync` (see [Git And PRs](git-and-prs.md) and [stacked-prs](../stacked-prs/SKILL.md)). If the rebase brought in upstream `pnpm-lock.yaml` or `package.json` changes, run `pnpm install` before any later `pnpm` command — see the `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` row in [`docs/development/tests.md`](../../../docs/development/tests.md#local-web-validation-recovery).

If the sandbox blocks `pnpm run ...` or `pnpm exec ...` commands inside the script, retry with sandbox mode disabled on Claude (approved prefixes: `["pnpm", "run"]`, `["pnpm", "exec"]`). `pnpm --dir ...` stays on the ordinary sandboxed path; request one exact escalation if it fails instead of granting a reusable prefix. Grok cannot unsandbox one command mid-session; under workspace-write run `pnpm exec` serially, or use `node_modules/.bin/<tool>` for parallelism.

When CI fails, fix the underlying issue and push again. Do not classify a repeatedly failing check as flaky or infrastructure without evidence; investigate after two consecutive failures and escalate to the human only with evidence the agent cannot resolve it. When CI fails but latest runs on the target branch are green, treat the failure as related to your changes until proven otherwise. For known infrastructure-failure signatures and the confirm-before-rerun discipline, see [Classifying Transient Infrastructure Failures](../../../docs/development/ci.md#classifying-transient-infrastructure-failures) and the [`ci/transient-retry/` catalogue](../../../ci/transient-retry/README.md). Treat a failing Vouchington patch-coverage gate (`coverage-check` against `.coverage-rules.yml`) as a PR blocker unless a human explicitly accepts the exception. Codecov runs in a separate, informational-only workflow job over full (unsparsified) LCOV; it never gates a PR and a failing/skipped Codecov upload is never a blocker.

Knip owns unused dependency detection and participates in unused export detection for the workspace; the replacement must be proven with a failing fixture or CI check. Knip's `duplicates` issue type is narrower than project-wide export-name uniqueness: it catches duplicate or alias export declarations, not every repeated export name across a project.

Changing `package.json` also requires `pnpm run syncpack:lint && pnpm run no-mistakes` (auto-fix Syncpack with `pnpm run syncpack:fix`) and committing the matching `pnpm-lock.yaml` changes.

See [docs/checklists/commit.md](../../../docs/checklists/commit.md) for the pre-commit checklist (format, lint, message, file size) and the [git-commit-checklist skill](../git-commit-checklist/SKILL.md) for the skill entry point. For `package.json` changes see the [package-json-checklist skill](../package-json-checklist/SKILL.md).

To avoid agent drift, add deterministic rules to local automation when a policy can be checked mechanically.
Before authoring a new guardrail, use the static-analysis [rule placement decision guide](../../../static-code-analysis/README.md#where-to-put-a-new-rule-priority-order)
and the [Guard Authoring Checklist](../../../static-code-analysis/README.md#guard-authoring-checklist) so repo-local custom parsers remain a last resort.
When authoring or modifying ast-grep rules specifically, follow the [Guard Authoring Checklist](../../../static-code-analysis/README.md#guard-authoring-checklist) — seven common footguns (missing `stopBy: end`, self-closing JSX arm, `.ts`/`.tsx` companion rule, catch-block traversal, real-world fixtures, `ast-grep scan` preflight, and Rust `regex` no-lookaheads/lookbehinds) are caught there before CI. For local preflight: `pnpm exec vitest run --project static-analysis-ast-grep`.
