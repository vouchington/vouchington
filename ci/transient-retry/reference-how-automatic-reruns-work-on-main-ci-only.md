# How automatic reruns work on `main` (CI only)

[Back to Transient-Retry Rule Catalogue](README.md#how-automatic-reruns-work-on-main-ci-only)

## Gate

While either default-off `HARNESS_DISPATCH_ENABLED` or `HARNESS_FIX_MAIN_ENABLED` is not exactly
`true`, `fix-main.yml` skips the entry job before transient classification, reruns, or Harness
dispatch.

## Procedure when enabled

1. A CI run completes with `failure`, `timed_out`, or `cancelled` on `main`.
2. `fix-main.yml` triggers its `triage-and-rerun` job.
3. That job runs `node ci/transient-retry/decide.mts`, which:
   - Fetches prior attempt job counts and failed job names via the GitHub API with bounded retries for transport failures.
   - Replays prior attempts chronologically through the same ordered evaluator used for the current decision. Each successful `rerun` decision increments only that rule's counter; `ignore` continues to use the shared attempt count.
   - Uses each rerun rule's reconstructed next-occurrence count for `maxAttempts`. If prior jobs or evidence actually requested by a matcher cannot be fetched while replaying a later rule, reconstruction retains the proven ordered-rule prefix and omits that rule and its suffix so they use the conservative shared count, which discounts only known zero-job attempts. If the first rule's evidence is unavailable, every rule uses that shared fallback.
   - Writes `decision=rerun`, `decision=ignore`, or `decision=dispatch` to `$GITHUB_OUTPUT`.
4. If `decision=rerun`: the job calls `gh run rerun` and sets `should_dispatch=false`.
5. If `decision=ignore`: the job sets `should_dispatch=false` without rerunning because no code-fix signal exists.
6. If `decision=dispatch`: the prompt-render job re-reads the source workflow run before dispatch.
   The run ID and repository must still match, its current attempt must equal the completed event
   attempt, and its status/conclusion must still describe that same failed completion. A queued,
   running, or completed later attempt makes the event stale and stops dispatch. Missing,
   malformed, or inaccessible API state also stops dispatch rather than guessing.
7. Before a failed Harness path opens or updates a needs-human issue, the escalation job performs the
   same source-state check. This prevents an obsolete attempt from escalating after its rerun has
   already started.

## Fix Main classifies its own downstream failures too

`fix-main.yml`'s own downstream jobs (`related-candidates`, `render-prompt`, `dispatch`) can fail —
most commonly on transient host-capacity conditions, not the monitored workflow's own defect. Before
`escalate` files a needs-human issue, a `classify-self-failure` job runs the same `decide.mts` against
Fix Main's **own** run (its `WORKFLOW_RUN_ID`/`WORKFLOW_NAME`/`RUN_ATTEMPT`, not the monitored run's).
`escalate` withholds filing only while that classification is still `retry_pending`.

No currently-live rule is workflow-agnostic, so `classify-self-failure` can only add a rerun when
Fix Main's own failure happens to match a rule that is otherwise scoped to a specific monitored
workflow or job name (for example, one of the coverage-artifact rules if Fix Main's own coverage
step reproduces that exact fingerprint).

A run cannot rerun its own in-progress jobs, so the rerun itself is issued from a separate sibling
workflow, `fix-main-self-retry.yml`, which watches `Automation Fix Main`'s completed runs via
`workflow_run` and reruns known-transient failures once, gated by a structural `run_attempt < 3`
ceiling independent of that per-rule cap. It is not part of `fix-main.yml`'s own `workflow_run`
subscription list, so this can never create a self-triggering loop. See
[reference-harness-automation.md](../../.github/workflows/reference-harness-automation.md) for the
full termination-layer breakdown.

Because `escalate` withholds its issue on the strength of a decision, not a confirmed action, the
watcher checks, as ground truth independent of its own `decide.mts` re-invocation, whether the
original Fix Main run's `escalate` job already fired (via the Jobs API). It records the failure as
handled only when that escalation is confirmed, an exact successful source check reports
`current=false`, or a rerun request succeeds. Every other path fails closed and opens or updates one
Fix-Main-run-keyed `needs-human` issue saying only that automation could not confirm a safe terminal
outcome. This avoids claiming that a transient rerun failed when classification selected dispatch,
ignore, or was unavailable.

The five checked-out Fix Main control-plane jobs install with `install-scripts: 'false'`. They need
the dependency graph to run repository tooling, including `vouchington-tooling` in the related-
candidate path, but do not need dependency lifecycle hooks or unrelated native-addon downloads.

The `triage-and-rerun` job's `outputs.should_dispatch` name is stable — all downstream jobs gate on it.
Fix Main runs for the same source workflow, SHA, and source event type also use cancel-in-progress
concurrency, so a later push-origin completion supersedes older push-origin automation without a
no-op manual completion cancelling it.

`runnerShutdownLeafRerunMatch` (`ci/transient-retry/runner-shutdown-consumers.mts`) is the matcher
for the standalone `runner-shutdown-leaf-rerun` rule and also narrows the coverage-artifact rules
above. It treats each exact sibling job as a consumer with its own durable-failure guard —
`static-checks / static-web`, for example, only counts as a clean shutdown after the `next build`
command started and only when no compiler, bundler, smoke-test, non-SIGTERM exit, or other web-stack
failure signal is present. Every new consumer must carry a trimmed real-log fixture and
counterfixtures; unknown consumers are treated as a real failure by the matcher.
