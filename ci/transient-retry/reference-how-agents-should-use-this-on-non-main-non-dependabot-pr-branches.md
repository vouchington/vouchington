# How agents should use this on non-`main`, non-Dependabot PR branches

[Back to Transient-Retry Rule Catalogue](README.md#how-agents-should-use-this-on-non-main-non-dependabot-pr-branches)

Agents working on non-`main`, non-Dependabot PR branches should:

1. Read `ci/transient-retry/rules.mts` before writing a code fix.
2. If the failing run matches an existing rule (same conclusion, same failing jobs, same log fingerprint), it is a known-transient failure. Use the helper to confirm the fingerprint and rerun instead of manually matching rules and calling `gh run rerun`:
   ```sh
   node ci/transient-retry/rerun-known-transient.mts <run-id>
   ```
3. If you identify a **new** transient pattern, add a rule entry (see authoring guide below) as part of your PR.

## Ineffective rerun patterns

- A rerun replays the same head SHA against the same base merge. If a shard keeps failing identically and `origin/main` has moved, rerunning cannot pick up the fix — rebase onto `origin/main` and push instead.
- Every `gh run rerun` creates a new run **attempt**; it is not idempotent (see [Standalone Workflow Checks](../../docs/development/reference-ci-standalone-workflow-checks.md)). Do not start a rerun while one is already in progress, and do not rerun a run you just cancelled — overlapping attempts race and their recorded state can disagree.
- Confirm the fingerprint with `node ci/transient-retry/rerun-known-transient.mts <run-id>` before rerunning at all; an unmatched failure is a real failure until a rule with a real-log fixture says otherwise.
