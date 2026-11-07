# Merge Queue Fail Fast

[Merge Queue Fail Fast](../../../../.github/workflows/merge-queue-fail-fast.yml) is a scheduled sweep
that cancels a merge-queue entry's area runs once a job that feeds a required gate has failed.
Pull requests keep running every suite to the end.

## Why only the merge queue

Each required area gate `needs` every suite in its area, so a gate reports only after the slowest
suite finishes. On a pull request that is what the author wants: one run lists every failure, and
nobody else waits for it. In the merge queue the trade-off reverses:

- A failed gate-feeding job ejects the entry no matter what the other suites do, so every later
  minute of that entry's CI is wasted.
- Every entry behind it waits on that entry, and when it is ejected GitHub rebuilds them all from
  scratch. A failure that is only reported once the slowest suite finishes delays the whole queue
  by that time.
- Failures that appear only in the queue cost the most. Merge-group-only work, such as backend
  image publication and its vulnerability scan, can fail every queued entry at once when an
  outside change, such as a newly published OS advisory, lands.

## How it works

The sweep lists active merge-group runs, reads each entry's failed jobs, and cancels the area runs
of an entry whose failed job feeds a gate. Jobs no gate waits on (the coverage upload and the
informational credentialed suites) never eject an entry, so the sweep ignores them. Its workflow
test keeps the watched workflows and the ignored jobs equal to what the required gates wait on.

On a merge group, each area gate also runs after its run is cancelled. It sees the failed job
among its needs and fails, so:

- the entry's required check fails on the real failed job, never with `cancelled`;
- the queue ejects the entry the same way as any other CI failure, so
  [Merge Queue Ejection](../../../prompts/automation/merge-queue-ejection.md) still dispatches its
  triage session;
- the failed job keeps its `failure` conclusion, so triage and
  [Cancel Dequeued Merge Group Runs](reference-merge-queue-run-cancellation.md#dequeued-pull-requests)
  still see the evidence.

On pull requests and other events the gates keep `!cancelled()`, so a superseded pull-request run
that concurrency cancels reports nothing.

The sweep is never a required check, so its own failure cannot eject an entry, and it waits inside no
job. Its savings depend on GitHub's scheduler, which can start scheduled runs late under load; a late
sweep is never slower than letting the slowest suite finish.

## Rejected alternatives

- **A watcher job per entry** that polls until the entry's runs finish holds a runner for the whole
  merge-group run only to wait, which the canonical Actions checklist rejects. Actions has no event
  for a sibling job failing, and the Checks events of Actions-created runs do not trigger
  workflows, so a schedule is the event.
- **A cancel step in every job** (`if: failure()` on merge groups) needs `actions: write` on every
  job in the merge-group graph, including on pull-request runs, because job permissions cannot
  depend on the event. Every new job would also have to remember the step.
- **Making each suite a required check** would let the queue eject on the first failure natively,
  but it replaces the stable area gates with a required-check list that changes with every job.
- **Synthesizing a failed required check** through the Checks API is forbidden by the canonical
  checklist: workflow code must not publish a check run to stand in for a required context.
