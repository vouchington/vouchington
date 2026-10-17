# jscpd Clone-Size and Dead-Code Gates

Source entrypoint: [static-code-analysis/jscpd/README.md](../../../../../static-code-analysis/jscpd/README.md)

[Back to Static Code Analysis](../README.md)

Two separate checks share the released jscpd package and [`.jscpd.json`](../../../../../.jscpd.json), which owns thresholds, formats, ignore globs, dead-code categories, and entry roots.

## Dead-code baseline

`pnpm run jscpd:dead-code` scans a temporary copy of the tracked working-tree files, so unstaged edits to tracked files count but untracked importers, manifests, and `.gitignore` files cannot change reachability. It leaves test-only code outside this gate (`used-only-by-tests` findings and test, helper, and Storybook paths) while keeping an unimported source file visible.

Findings are compared against a reviewed baseline by category, path, parent, name, and symbol kind, with repeats counted, so a new or increased finding fails even when another disappears. Line numbers and message wording do not matter. A removed finding makes the baseline stale; after verifying a cleanup run `pnpm run jscpd:dead-code:update`, which refuses new or increased findings. Review baseline changes as code changes; do not change the confidence floor or widen the test-only exclusion to make a run pass.

`deadCode.entry` roots are runtime, CLI, generator, or loader targets that no import reaches. Keep them narrow so ordinary helpers still need consumers; every entry must match a tracked file or the guard fails.

## Clone size

The clone gate is the plain `jscpd .` CLI. The configured `"minLines": 50` and `exitCode` fail the run on any clone at or above the threshold, with no baseline and no base-branch comparison, so a pull request, a merge group, and a `main` push agree. jscpd also skips files shorter than `minLines`.

The configured `similarity` makes jscpd compare JavaScript and TypeScript function pairs by AST similarity, ignoring identifier names and literal values, so a copied function that renames variables or changes literals still counts. Keep a long unique query outside the function so two thin wrappers are not one clone. Code outside a function, and SQL, Bash, and CSS, stay exact-only.

The threshold only moves down. Preview a lower value with `pnpm exec jscpd . --min-lines <N>`, deduplicate or add a reviewed exception, then lower `minLines` here and in `.jscpd.json` in the same change. A preview at lower similarity flags generated suites and parallel product flows, not shared functions to extract.

jscpd scans the working tree, not `git ls-files`: CI is clean, but locally an untracked file `.gitignore` does not cover is scanned too. It can only add clones, never hide one; delete or ignore the stray file.

These globs exclude whole categories where repetition is not hand-maintained duplication:

- `**/migrations/**`: shipped migrations are never edited, so repeated DDL is history, not code to extract.
- `**/fixtures/**`: test data that repeats shapes on purpose.
- `**/route-selectors.generated.mts`: generated output.

## Exceptions

Add the narrowest `**/` glob (ideally one file) to `ignore` in `.jscpd.json`, add a row with the reason dedupe is out of scope and an owner, and delete both when the duplication is removed. `wiring.test.mts` fails when a configured glob is missing from this page or the table lists a glob the config does not.

| Glob                         | Reason                                                                                                                                                          | Owner                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `**/bank-account-fields.tsx` | Parallel bank-account form. Similarity drops field names and literals, so it scores above the threshold against the credit-card form and stays a separate flow. | `web/components/posts` |
| `**/credit-card-fields.tsx`  | Parallel credit-card data-point form, the other half of the bank-account pair above.                                                                            | `web/components/posts` |
