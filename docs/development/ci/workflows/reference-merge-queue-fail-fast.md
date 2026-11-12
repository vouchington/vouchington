# Merge Queue Fail Fast

Each required area gate depends on every suite in its area, so a merge-group failure used to eject
the entry only after the slowest suite ended, and every entry queued behind it was rebuilt late. On
a `merge_group` event a failing suite now cancels its own run, and the gate fails on the real failed
job straight away. Pull requests are unchanged. No schedule, sweep, or poll is involved: the cancel
reacts to the suite's own failure.

The mechanism lives in the area workflows (for example
[`backend.yml`](../../../../.github/workflows/backend.yml)) and is pinned by the drift guard
[`merge-group-self-cancel.test.mts`](../../../../.github/workflows/merge-group-self-cancel.test.mts).
That test is the source of truth for which jobs cancel, their conditions, and their permissions;
this page does not repeat them.

## Why it is shaped this way

- **Cancel only on the suite's own failure.** A cancel job must react to its suite's result, not to
  any upstream failure. An unrelated failed check would otherwise cancel suites that did nothing
  wrong.
- **The gate still runs after a cancel.** A cancelled merge-group run must still evaluate its gate so
  the gate reads the failed job and the queue ejects the entry as a CI failure rather than as a
  silent cancellation. Pull-request runs keep ordinary cancellation behavior.
- **Write access is confined to checkout-free cancel jobs.** Cancelling needs a token with
  `actions: write`, and job permissions cannot depend on the event. Granting it to a suite job would
  hand a write token to pull-request-controlled code (checked-out scripts and local actions) on
  same-repository pull requests, which the
  [trust boundary checklist](reference-pr-triggered-workflow-trust-boundary-checklist.md) forbids. A
  separate job with no checkout runs no repository code, so its write grant never meets
  pull-request-controlled content, and every suite job keeps the permissions it had.
- **The cost of a separate job.** It fires when the called suite workflow finishes (all its shards),
  not at the first failed shard. That still ends the run well before the slowest suite in the area.
- **The nightly ceiling is not a grant.** A caller statically caps the permissions of the workflow
  it calls, so the nightly caller must allow the write scope for the area callers. Suite jobs
  declare their own narrower permissions, so the ceiling grants them nothing.

## Jobs that deliberately do not cancel

The test enumerates the cancelling jobs from each gate's dependencies. The exclusions are by design:

- **Informational jobs** (coverage upload, credentialed suites). A failure keeps its own check red
  but must not eject an entry.
- **Change detection and static checks.** Every suite waits on them, so a failure skips the rest and
  the run ends at once.
- **Pull-request-only jobs.** They never run in the merge queue.
- **Single-scan areas.** A gate waiting on one job has nothing to shorten.

## Edge cases and triage

- **Cancel races a finished run.** The request can land after the run completed, or a sibling cancel
  already cancelled it. GitHub answers HTTP 409, which the step tolerates with a warning. Any other
  error fails the cancel job and shows in the run.
- **Results after cancelling.** The suite job that failed keeps `failure`. Jobs still running become
  `cancelled`, including sibling suites and the cancel job itself. Triage must read the failed jobs
  of the run, and for a `cancelled` job its failed step, not the run conclusion; see the
  [merge-queue-ejection prompt](../../../prompts/automation/merge-queue-ejection.md).
- **Job timeouts.** A timed-out suite ends as `cancelled`, not `failure`, so no cancel runs and that
  entry waits as before.
- **Re-run of failed jobs.** A re-run starts a new attempt of the same run and event, so a
  merge-group re-run can cancel again on a second failure.
- **Dead entries.** [Cancel Replaced and Cancel Dequeued Merge Group Runs](reference-merge-queue-run-cancellation.md)
  cancel runs of entries that are rebuilt or leave the queue. Their cancelled runs now also run the
  gate, which fails; the entry is already out, so that is one short job. Their guard that keeps a
  run holding a `failure` job also keeps the runs this change cancels.
- **Pull requests.** A pull-request run is never cancelled this way. Authors want every failure from
  one run, and a pull-request token never holds the write scope anywhere else.
