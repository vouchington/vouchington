Review the latest CI runs. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check the latest target-branch runs first. If target-branch CI is already failing the same way, document that before changing anything.
- Look for path filters that miss tests that should run or run expensive jobs unnecessarily.
- Look for slow setup, cache, install, build, or test steps that can be narrowed safely.
- When replacing an analyzer, compare diagnostics, execution environment, stale references, and
  measured runtime before removing the old path.
- For partial reruns, account for GitHub rerunning the selected job and its downstream dependents;
  verify reused upstream sibling artifacts and bootstrap fingerprints remain coherent and preserve
  the resource summary and exit evidence needed to diagnose the original failure.
- Before adding or widening an `actions/upload-artifact@v7` step, question whether the upload is
  needed at all. GitHub Actions storage is billed on private repos (see
  [CI Reference](../../development/ci.md) for the artifact-and-log retention policy);
  `retention-days` is a **ceiling**, not the actual lifetime. Apply this delete-classified outcome
  matrix; KEEP-classified artifacts are never cleanup candidates and remain until GitHub expires
  them:

  | Producing-run conclusion                                                                             | Delete-classified artifact handling                                                                                                                                         |
  | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `success` from a trusted producer with a terminal `cleanup-artifacts.yml` fan-in                     | Immediate in-run cleanup after every required same-run consumer and terminal job resolves successfully or legitimately skips.                                               |
  | `success` from an untrusted/read-only pull-request run                                               | Eligible only for the trusted 6-hourly scheduled sweep once artifact `created_at` is older than 6 hours; never grant PR-controlled cleanup code `actions: write`.           |
  | `success` from any other workflow                                                                    | Eligible only for the 6-hourly scheduled sweep once artifact `created_at` is older than 6 hours.                                                                            |
  | `cancelled`                                                                                          | Eligible only for the scheduled sweep once artifact `created_at` is older than 6 hours.                                                                                     |
  | `failure`, `timed_out`, `action_required`, known unknown/unrecognized, or any other known conclusion | Never swept; retain until GitHub expiration.                                                                                                                                |
  | Unavailable/null run lookup                                                                          | Skip the current sweep and retry on the next scheduled sweep; if later resolved `success`/`cancelled`, it becomes eligible, otherwise it follows the known-conclusion rule. |

  The sweep cadence means this is not a grace period measured from cancellation: eligibility is based
  on the artifact's `created_at`, and deletion waits for the next sweep. Account for classification,
  producing workflow, and conclusion when estimating storage cost. Preserve the detailed rerun
  contract in [Artifact Rerun Safety](../../../.github/workflows/reference-artifact-rerun-safety.md)
  instead of restating it in a workflow change.

- A new or renamed artifact name must land deliberately in the `keep` or `delete` list in
  [ci/cleanup-artifacts-patterns.json](../../../ci/cleanup-artifacts-patterns.json). Use an exact
  name or one exact prefix followed by a trailing `*`; richer glob syntax is rejected. Note the guard's
  blind spot when proposing a fix in this area:
  `artifact-retention-policy.test.mts`'s "requests only one-day artifact retention repo-wide" check
  matches only a literal digit (`retention-days:\s+(\d+)`) — an upload that omits the key entirely,
  or that sets it to an expression or other nonnumeric value (e.g. `retention-days: ${{ ... }}`),
  produces no regex match and silently inherits (or resolves to) whatever the repository's 3-day
  default or the expression's own value turns out to be. A real gap, and a candidate target: add a
  positive assertion that every `upload-artifact` step's block contains the literal
  `retention-days: 1` — checking only that the key is present would still let an expression or a
  non-`1` literal through undetected.
- Before implementing a proposed check with new parsing/traversal machinery (e.g. an
  AST/visitor-based approach), survey the target directory/module for an existing convention that
  already solves the same problem shape — grep for the target library's canonical import alias
  (e.g. `parse as load` for the `yaml` package). Prefer extending or reusing that existing idiom;
  only introduce new machinery when the existing idiom is demonstrably insufficient, and state why.
- Preserve the rerun-safety contract from
  [Artifact Rerun Safety](../../../.github/workflows/reference-artifact-rerun-safety.md)
  (`overwrite: true`, sweep only `success`/`cancelled`-concluded runs, never `failure`) — extend it,
  do not restate its rules inline.
- Use `pnpm run ci:topology --format json` or `--format mermaid` when a change depends on
  cross-workflow calls, `needs`, or concurrency; keep intent in the typed policy, not a duplicate
  workflow inventory.
- Improve fail-fast behavior, reliability, or diagnostics without hiding real failures.
- Distinguish checks that gate merge (the [Main ruleset's required gates](../../../.github/workflows/CLAUDE.md#scoped-invariants)) from report-only checks such as supply-chain and dependency scans that do
  not appear in that list; do not treat a report-only finding as a merge blocker, and call out
  explicitly if a change would promote a report-only check to required.
- Validate workflow or tooling changes with the narrowest relevant local test. If a validation
  command times out without producing a diagnostic, either (a) rerun it narrowed to only the
  changed files within budget, or (b) add an explicit `## Follow-ups` entry naming the specific
  check that never completed — never assert "no follow-ups are required" in a PR body when a
  required validation is disclosed as timed out or incomplete. Root `CLAUDE.md`'s "generate
  synthetic SHA-shaped fixtures" guidance means generating the ref/SHA value at runtime, not
  embedding a 40-hex-character literal in test source.
