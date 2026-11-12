# Merge Queue Fail Fast

Each required area gate (`static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`,
`gitleaks`) `needs` every suite in its area, so a merge-group failure ejects the entry only after
the slowest suite ends, and every entry queued behind it is rebuilt late. On a `merge_group` event
a failing suite now cancels its own run, and the gate fails on the real failed job straight away.
Pull requests are unchanged. No schedule, sweep, or poll is involved: the cancel job reacts to the
suite's own failure.

## How it works

1. **Cancel job.** Beside each gate-feeding suite, the area workflow has a `cancel-<suite>` job with
   `needs: [<suite>]` and
   `if: ${{ failure() && needs.<suite>.result == 'failure' && github.event_name == 'merge_group' }}`.
   The `result` check matters: `failure()` alone is true when any upstream job failed, such as a
   static check, which must not cancel. The job POSTs to the run's cancel endpoint (`gh api`) and
   does nothing else.
2. **Gate condition.** Each gate uses
   `if: ${{ !cancelled() || github.event_name == 'merge_group' }}`. A cancelled merge-group run
   still evaluates the gate, which reads its `needs` and fails on the failed job, so the queue
   ejects the entry as `CI_FAILURE`. A pull-request run keeps `!cancelled()`. The gate does not
   depend on the cancel jobs.
3. **Why a separate job, not a final step.** The run token needs `actions: write` to cancel, and
   `permissions` cannot be conditional on the event. Granting it to a suite job would hand a write
   token to pull-request-controlled code (checked-out scripts and local actions) on same-repository
   pull requests, which the
   [trust boundary checklist](reference-pr-triggered-workflow-trust-boundary-checklist.md) forbids.
   The cancel job has no checkout and runs no repository code, so its job-level `actions: write`
   never meets pull-request-controlled content, and every suite job keeps the permissions it had.
   The cost: it fires when the called suite workflow finishes (all its shards), not at the first
   failed shard, which still ends the run well before the slowest suite in the area.
4. **Permission ceiling.** A caller caps the permissions of the workflow it calls statically, so
   `nightly.yml` lists `actions: write` on its area callers. Suite jobs declare their own narrower
   permissions, so this grants them nothing.

## Which jobs cancel

The drift guard [`merge-group-self-cancel.test.mts`](../../../../.github/workflows/merge-group-self-cancel.test.mts)
derives the jobs from each gate's `needs`. Every gate-feeding job has a cancel job, including the
shared `prepare-postgres` caller in `backend.yml`. These do not:

- **Informational jobs** such as `codecov`, `coverage` (pull requests only), and the credentialed
  suites. A failure keeps its own check red but must not eject an entry.
- **Change detection and static checks.** Every suite waits on them, so a failure skips the rest
  and the run ends at once.
- **Pull-request-only jobs** such as the image validators.
- **`gitleaks`.** Its gate waits on a single scan, so there is nothing to shorten.

## Edge cases

- **Cancel races a finished run.** The cancel request can land after the run completed, or a
  sibling cancel job already cancelled it. GitHub answers HTTP 409, which `gh api` keeps in its error text (`gh run cancel` rewrites it); the step warns and succeeds.
  Any other error (for example a 403, or `gh` missing) fails the cancel job and shows in the run.
- **Results after cancelling.** The suite job that failed has already finished, so it keeps
  `failure`. Jobs still running become `cancelled`, including the cancel job itself and any sibling
  suite. Triage must read the failed jobs of the run, and for a `cancelled` job its failed step,
  not the run conclusion; see the
  [merge-queue-ejection prompt](../../../prompts/automation/merge-queue-ejection.md).
- **Job timeouts.** A timed-out suite ends as `cancelled`, so its result is not `failure` and no cancel
  runs; that entry waits as before.
- **Re-run of failed jobs.** A re-run starts a new attempt of the same run and event, so a
  merge-group re-run can cancel again on a second failure.
- **Dead entries.** [Cancel Replaced and Cancel Dequeued Merge Group Runs](reference-merge-queue-run-cancellation.md)
  cancel runs of entries that are rebuilt or leave the queue. Their cancelled runs now also run the
  gate, which fails; the entry is already out, so that is one short job. Their guard that keeps a
  run holding a `failure` job also keeps the runs this change cancels.
- **Pull requests.** The cancel job cannot cancel a pull-request run: its condition requires
  `merge_group`. Authors want every failure from one run, and a pull-request token never holds
  `actions: write` anywhere else.
