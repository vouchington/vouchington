Review the latest CI runs. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why.

Load `github-actions-authoring` and `github-actions-rules`.

- Check the latest target-branch runs first; if they already fail the same way, document that before changing anything.
- Look for path filters that miss tests or run expensive jobs needlessly, and slow setup, cache, install, build, or test steps that can be narrowed safely. Improve fail-fast behavior and diagnostics without hiding failures.
- When replacing an analyzer, compare diagnostics, environment, stale references, and measured runtime before removing the old path.
- Partial reruns rerun the selected job and its dependents: verify reused sibling artifacts and bootstrap fingerprints stay coherent ([Artifact Rerun Safety](../../development/ci/workflows/reference-artifact-rerun-safety.md)).
- Question every new or widened artifact upload; follow the retention policy in [CI Reference](../../development/ci.md). A new artifact name must be listed under `keep` or `delete` in [ci/cleanup-artifacts-patterns.json](../../../ci/cleanup-artifacts-patterns.json). Confirm current retention-test coverage before claiming a gap.
- Before adding parsing or traversal machinery, grep the target directory for an existing idiom and extend it.
- Use `pnpm run ci:topology --format json|mermaid` for cross-workflow calls, `needs`, or concurrency.
- Distinguish merge-gating checks ([Main ruleset](../../../.github/workflows/AGENTS.md)) from report-only ones; call out any promotion.
- If validation times out, rerun it narrowed to the changed files or list the unfinished check under `## Follow-ups`; never claim no follow-ups.
- Mass failure: when a `merge_group` run ejects a PR and several unrelated jobs fail the same shared step at that step's `timeout-minutes`, it is a stalled shared dependency, not a flake. Read the log before the kill and fix the repository-owned cause. Do not add retries, widen the timeout, or pin a deliberately floating tool.
- Backstop: a capped step must kill its whole process group; `timeout-minutes` does not reap children. Hang-prone steps belong under the `vouchington-tooling` bounded runner, with job timeouts below the sum of step budgets.
