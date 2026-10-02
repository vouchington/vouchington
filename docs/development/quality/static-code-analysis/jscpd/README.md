# jscpd Clone-Size and Dead-Code Gates

Source entrypoint: [static-code-analysis/jscpd/README.md](../../../../../static-code-analysis/jscpd/README.md)

[Back to Static Code Analysis](../README.md)

The clone-size command and dead-code command are separate checks. The clone-size command below
keeps its existing working-tree behavior. The dead-code guard runs the same released jscpd package
against a temporary copy of the current **tracked working-tree files**. It includes unstaged edits
to tracked files and excludes untracked importers, package manifests, and `.gitignore` files, any of
which could otherwise change reachability. It rejects symlinks outside the repository.

## Dead-Code Baseline

`pnpm run jscpd:dead-code` checks all five categories in `.jscpd.json` at its configured minimum
confidence. It runs in `pnpm run lint`, the Static Analysis workflow, and `ci-local static`.
The guard consumes jscpd's native JSON report, fails when the analyzer fails, analyzes no files,
or leaves unparsed files, and compares every finding by category, path, parent, name, and symbol
kind. Repeated findings share an identity with a count, so a new or increased finding fails even
when another finding disappears. Line numbers and message wording do not affect that identity.

The checked-in [`dead-code-baseline.json`](../../../../../static-code-analysis/jscpd/dead-code-baseline.json)
temporarily records reviewed findings, including helpers used only by tests and framework or
Storybook symbols jscpd cannot recognize. Removing a finding makes the baseline stale and fails
the regular check. After verifying a cleanup, run `pnpm run jscpd:dead-code:update` to remove
only stale findings; it refuses new or increased findings. `--seed` creates an initial baseline only
when no baseline exists. Review baseline changes as code changes, rather than changing the minimum
confidence or broadly ignoring tests.

The explicit `deadCode.entry` roots are runtime, CLI, generator, or configuration loader targets.
They are kept narrow so ordinary helpers still require consumers. The entries are:

| Loader                               | Roots in `.jscpd.json`                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend executable and scripts       | `backend/entrypoints/api/verify-ipv6-egress.mts`, `backend/entrypoints/worker-cpu/serve.mts`, `backend/modules/structured-decisions/benchmark.mts`, `backend/scripts/backfill-rss-feed-item-source-publications.mts`, `backend/scripts/seed-source/run.mts`                                                                     |
| Backend configuration/type sources   | `backend/data-stores/psql/config-driven/*.mts`, `backend/types/lib-dom-absent.mts`                                                                                                                                                                                                                                              |
| CI and development commands          | `ci/transient-retry/rerun-known-transient.mts`, `dev/agent-issue-labels/batch-issues.mts`, `dev/agent-issue-labels/labels-from-paths.mts`, `dev/localization/local-catalog.mts`, `dev/localization/local-smoke.mts`, `dev/native-addon-readiness.mts`, `dev/otel-register.mts`                                                  |
| Hooks and PR tooling                 | `.pr-shepherd/classification/*.mts`, `dev/codex-hooks/persist-session-id.mts`, `dev/codex-hooks/post-tool-use.mts`, `dev/codex-hooks/pre-tool-use.mts`                                                                                                                                                                          |
| Static analysis loaders              | `static-code-analysis/oxlint-plugin.cjs`, `static-code-analysis/repo-file-policy-worker.mts`                                                                                                                                                                                                                                    |
| Web generation and Storybook aliases | `web/generate-membership-benefit-catalog.ts`, `web/storybook/mocks/contribute-cta-aside.tsx`, `web/storybook/mocks/get-resolved-ui-locale.ts`, `web/storybook/mocks/get-translations.ts`, `web/storybook/mocks/languages.ts`, `web/storybook/mocks/load-server-messages.ts`, `web/storybook/mocks/upgrade-membership-aside.tsx` |
| Vitest setup                         | `web/test-helpers/vitest.setup.fake-timer-guard.mts`, `web/test-helpers/vitest.setup.storybook-browser-guard.mts`                                                                                                                                                                                                               |

The [scope contract](../../../../../static-code-analysis/jscpd/dead-code-scope.mts) pins these
entries and the scanner's formats, exclusions, categories, and confidence floor; scope changes
need an explicit policy edit. Every configured entry must match a file in the tracked snapshot,
or the guard fails. The RSS
source-publication backfill remains an explicit CLI root; its cleanup is a separate change.

The clone-size gate is the plain [jscpd](https://github.com/kucherenko/jscpd) CLI, `jscpd .`, configured by
[`.jscpd.json`](../../../../../.jscpd.json); no wrapper sits in between. CI runs `pnpm exec jscpd .` in
[`static-code-analysis.yml`](../../../../../.github/workflows/static-code-analysis.yml), and `pnpm run lint`
runs the same command through the `jscpd` package script.

## How the Threshold Works

The configured `"minLines": 50` and `"exitCode": 1` make jscpd fail when it finds any clone that
spans roughly 50 lines or more. A clone is one duplicated block shared by two files, so the unit
that fails is the pair of copies, not one file. jscpd's console reporter lists each clone
(`Clone found (<format>): <file> [start:end] ... <file> [start:end]`) above a per-format summary
table. There is no baseline and no base-branch comparison: every run judges the whole tree the same
way, so a pull request, a merge group, and a `main` push agree.

Blocks shorter than the threshold are not reported and never fail the gate. jscpd also skips files
shorter than `minLines`, so the threshold bounds the scan as well as the report.

### Near-Miss Clones

`.jscpd.json` sets `similarity: 0.85`. Besides exact token matches, jscpd compares JavaScript and
TypeScript function pairs by AST similarity and reports a pair that reaches 85% as a `similar`
clone. The comparison ignores identifier names and literal values, so a copied function that renames
its variables, changes its literals, or adds or drops a line still counts. `minLines` applies to
both kinds. Code outside a function, and SQL, Bash, and CSS, stay exact-only.

## Lowering the Threshold

The threshold only moves down. To tighten it:

1. Preview what a lower value flags with `pnpm exec jscpd . --min-lines <N>`; the CLI flag overrides
   the configured value.
2. Deduplicate those clones by extracting the shared code, or add a reviewed
   [exception](#exceptions) when the dedupe is out of scope.
3. Lower `minLines` in `.jscpd.json` and the value quoted in this README in the same change, once
   the preview reports no clones.

`similarity` stays 0.85. A preview at 0.75 flags generated suites and parallel product flows, not a
shared function to extract.

## Scope

`.jscpd.json` scans TypeScript, TSX, JavaScript, SQL, Bash, and CSS; `crossFormats` also matches
clones between TypeScript and TSX. `failOnEmpty` fails a run that analyzes no files, which catches
an ignore list that swallows the whole tree. jscpd respects `.gitignore`.

jscpd scans the working tree, not `git ls-files`. CI checks out a clean tree, so it scans exactly
the tracked files. Locally, an untracked file that `.gitignore` does not cover is scanned too. This
is the sole exception recorded beside the tracked-state invariant in
[`static-code-analysis/AGENTS.md`](../../../../../static-code-analysis/AGENTS.md). An untracked file can only add clones, never hide
one, so it can fail a local run but never make a bad tree pass. Delete or ignore the stray file if
it reports a clone.

These scope globs exclude whole categories where repetition is not hand-maintained duplication:

- `**/migrations/**`: append-only SQL migrations. A shipped migration is never edited, so repeated
  DDL is history, not code to extract.
- `**/fixtures/**`: test data that repeats shapes on purpose.
- `**/route-selectors.generated.mts`: generated by
  [`route-selector-map.mts`](../../../../../static-code-analysis/i18n-extract/route-selector-map.mts).

[`wiring.test.mts`](../../../../../static-code-analysis/jscpd/wiring.test.mts) fails when a configured glob is missing from this README or
when the exceptions table lists a glob that `.jscpd.json` does not configure.

## Exceptions

To add an exception when dedupe is out of scope:

1. Add the narrowest `**/` glob that covers the duplicated file(s) to the `ignore` list in
   `.jscpd.json`, ideally a single file.
2. Add a row below with the glob in backticks, why dedupe is out of scope (link the follow-up
   issue), and the owner accountable for removing it.
3. Delete the row and the glob in the change that removes the duplication.

| Glob | Reason | Owner |
| ---- | ------ | ----- |

## Files

- [`.jscpd.json`](../../../../../.jscpd.json): the threshold, formats, and ignore globs.
- [`wiring.test.mts`](../../../../../static-code-analysis/jscpd/wiring.test.mts): keeps the package script, `lint`, CI, and `ci-local`
  on the same command, and this README in sync with the config. Run it with
  `pnpm exec vitest run --project static-analysis-tools static-code-analysis/jscpd`.
