# jscpd Duplication Ratchet

[Back to Static Code Analysis](../README.md)

`pnpm run jscpd` runs [`run-jscpd.mts`](../run-jscpd.mts), a repository policy wrapper around
[jscpd](https://github.com/kucherenko/jscpd). It fails only when a branch adds duplicated code that
its base lacks. Clones that already exist on the base are counted in the summary and never
fail the gate, so the repository gets less duplicated one change at a time without a big-bang
cleanup. CI runs it in [`static-code-analysis.yml`](../../.github/workflows/static-code-analysis.yml),
and `pnpm run lint` runs it locally.

## How the Ratchet Works

1. Validate [`.jscpd.json`](../../.jscpd.json) ignore globs and reject inline ignore markers (see
   [Scope](#scope) and [Exceptions](#exceptions)).
2. Resolve the baseline commit (see [Choosing the Base](#choosing-the-base)).
3. Scan the working tree's tracked files with `jscpd --baseline-from-ref <baseline>`. jscpd
   rescans the baseline tree **with `HEAD`'s `.jscpd.json`** and marks each clone `isNew` when the
   base tree lacks it.
4. Print only the new clones, one per line, then the remediation hint:

   ```text
   jscpd: 2 new clone(s) against merge-base 0123456789ab (origin/main):
     exact web/a.ts:10-30 ~ web/b.ts:4-24 (21 lines)
     similar web/c.ts:1-20 ~ web/d.ts:3-22 (20 lines)
   ```

With no new clones it prints `jscpd: no new clones against <baseline>; N files scanned, M existing
clones.` and exits 0. The baseline reads `merge-base <sha> (<ref>)`, or
`pull request merge parent <sha> (HEAD^1)` on a `pull_request` run.

Both sides are scanned with the same configuration, so a config-only change (a new format, a
narrower ignore glob, a stricter threshold) re-evaluates base and `HEAD` alike and reports no new
clones by itself. A jscpd failure, a `git` failure, a missing report, or a report whose shape
changed (for example a jscpd upgrade that drops `isNew`) fails the run; the gate never passes
silently on a tool error.

### Near-Miss Clones

`.jscpd.json` sets `similarity: 0.9`. Besides exact token matches (`exact`), jscpd compares
JavaScript and TypeScript function pairs by AST similarity and reports a pair that reaches 90% as
`similar`, so a copied function that changes its literal values or adds or drops a line still
counts as a clone. SQL, Bash, and CSS stay exact-only. The ratchet treats both kinds the same way:
only new ones fail. Identifiers are compared as written, so a copy that renames its variables is
not matched. [`run-jscpd-real-binary.test.mts`](run-jscpd-real-binary.test.mts)
proves the configured threshold catches a near-miss copy that exact matching misses.

### Touch It, Dedupe It

jscpd fingerprints clone content. Editing a line inside an existing clone changes its fingerprint,
so the edited clone counts as new even though the duplication predates the branch. The fix is to
extract the shared code into one helper and call it from both places, not to revert the edit. If
that dedupe is genuinely out of scope, add a reviewed [exception](#exceptions).

The same holds for a clone family: code copied into three or more files. Editing one copy can make
jscpd pair the untouched copies with each other over different line ranges, so a pair between two
files the branch never changed can also count as new. Dedupe the family, not only the edited copy.

## Choosing the Base

The baseline is the first of:

- The merge-base with `--base <ref>` (`pnpm run jscpd --base <parent-branch>`).
- On a `pull_request` run, `HEAD^1`: the first parent of the merge commit GitHub checks out. That
  parent is the tree the pull request merges into: the base branch tip, or, for a layer of a
  native GitHub stack, `main` plus every lower layer. A stack layer's run reports `main` as its base
  branch (`GITHUB_BASE_REF`), so a merge-base with `origin/$GITHUB_BASE_REF` would count the lower
  layers' clones against the layer. A `HEAD` without exactly two parents fails the run.
- The merge-base with `origin/main`: merge groups, manual workflow runs, and local runs.

In CI, the [`fetch-base-ref`](../../.github/actions/fetch-base-ref/action.yml) action unshallows the
checkout, so `HEAD^1` resolves, and fetches `origin/main` for merge groups and manual runs,
immediately before the jscpd step. Both steps skip on a `main` push, which has no base branch to
ratchet against, and on docs-only runs. See the
[static-code-analysis.yml reference](../../docs/development/reference-ci-static-analysis-static-code-analysis-yml.md).

`GITHUB_BASE_REF` is the base recorded by the event that started the run, not a live lookup. CI
does not run on a retarget (an `edited` event), and `gh run rerun` replays the original event, so a
run can compare against a base the pull request no longer has. Every summary line names the base it
used, such as `(origin/main)`. When that is not the pull request's current base, push to start a
fresh run instead of deduping. A stale pass cannot land a new clone, because the merge group
rescans against `origin/main`.

Locally, run `git fetch origin main` first when `origin/main` is stale or missing. On a stacked
branch, run `pnpm run jscpd --base <parent-branch>` so the ratchet compares against the parent;
`pnpm run lint` uses the `origin/main` default. An unresolvable base fails with both hints.

## Scope

`.jscpd.json` scans TypeScript, TSX, JavaScript, SQL, Bash, and CSS; `crossFormats` also matches
clones between TypeScript and TSX. `failOnEmpty` fails a run that analyzes no files, which catches
an ignore list that swallows the whole tree.

Only tracked files are scanned. The wrapper adds every untracked, non-ignored path to `--ignore`,
anchored to the repository root with glob metacharacters escaped; an untracked nested repository or
worktree (`dir/`) becomes `./dir/**`. jscpd splits `--ignore` on commas, so an untracked path or
config glob that contains a comma fails the run with a rename hint.

These scope globs exclude whole categories where repetition is not hand-maintained duplication:

- `**/migrations/**`: append-only SQL migrations. A shipped migration is never edited, so repeated
  DDL is history, not code to extract.
- `**/fixtures/**`: test data that repeats shapes on purpose.
- `**/web/storybook/component-story-ratchet-part-*.stories.tsx`: generated mount-smoke story shards
  (see the [storybook-authoring skill](../../.agents/skills/storybook-authoring/SKILL.md)).
- `**/route-selectors.generated.mts`: generated by
  [`route-selector-map.mts`](../i18n-extract/route-selector-map.mts).

The wrapper enforces three rules on every configured glob before scanning:

- **`**/`-anchored.** jscpd matches a bare glob at any depth, and it drops `./` globs on the
  merge-base rescan, which would make every clone in an ignored path look new.
- **Fresh.** A glob that matches no tracked file fails with "matches no tracked file; delete it
  and its README row". Freshness is checked against all tracked files, not only scanned formats.
- **Documented.** [`wiring.test.mts`](wiring.test.mts) fails when a configured glob is missing from
  this README or when the exceptions table lists a glob that `.jscpd.json` does not configure.

## Exceptions

Inline `jscpd:ignore-start` / `jscpd:ignore-end` markers are banned in every tracked non-Markdown
file; the wrapper fails and lists each `file:line`. Markers hide duplication from review, while an
exception is a visible, owned, reviewable entry.

To add an exception when dedupe is out of scope:

1. Add the narrowest `**/` glob that covers the duplicated file(s) to the `ignore` list in
   `.jscpd.json`, ideally a single file.
2. Add a row below with the glob in backticks, why dedupe is out of scope (link the follow-up
   issue), and the owner accountable for removing it.
3. Delete the row and the glob in the change that removes the duplication.

| Glob | Reason | Owner |
| ---- | ------ | ----- |

No exceptions are configured.

## Files

- [`run-jscpd.mts`](../run-jscpd.mts): entry point; validates, scans, and reports.
- [`cli.mts`](cli.mts): `--base` parsing and baseline selection.
- [`git.mts`](git.mts): tracked and untracked paths, baseline resolution, and the marker scan.
- [`ignore-globs.mts`](ignore-globs.mts): config glob validation, freshness, and `--ignore` building.
- [`process.mts`](process.mts): the injectable process runner.
- [`report.mts`](report.mts): the strict `jscpd-report.json` parser and clone formatting.
- Tests: [`run-jscpd.test.mts`](run-jscpd.test.mts) (fake repository scenarios),
  [`parsers.test.mts`](parsers.test.mts),
  [`run-jscpd-real-binary.test.mts`](run-jscpd-real-binary.test.mts) (the real jscpd binary on
  temporary git repositories, for exact and near-miss clones), and [`wiring.test.mts`](wiring.test.mts), with the
  [`jscpd-fake-repo.mts`](../test-helpers/jscpd-fake-repo.mts) helper. Run them with
  `pnpm exec vitest run --project static-analysis-tools static-code-analysis/jscpd`.
