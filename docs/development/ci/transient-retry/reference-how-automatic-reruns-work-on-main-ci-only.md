# How automatic reruns work on `main` (CI only)

[Back to Transient-Retry Rule Catalogue](README.md#how-automatic-reruns-work-on-main-ci-only)

## Gate

While either default-off `HARNESS_DISPATCH_ENABLED` or `HARNESS_FIX_MAIN_ENABLED` is not exactly
`true`, `fix-main.yml` skips the entry job before transient classification, reruns, or Harness
dispatch.

## Procedure when enabled

1. A subscribed main publication run, or a scheduled/manual `Nightly` run on `main`, completes with `failure`, `timed_out`, or `cancelled`.
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

Fix Main also classifies its own downstream failures through this catalogue, and the rerun is issued
by a sibling workflow; see [Auto Harness automation](../workflows/reference-harness-automation.md#completion-specific-safeguards).

The `triage-and-rerun` job's `outputs.should_dispatch` name is stable: all downstream jobs gate on it.
