# Merge Queue Fail Fast

[Merge Queue Fail Fast](../../../../.github/workflows/merge-queue-fail-fast.yml) cancels a
merge-queue entry's area runs as soon as a job that feeds a required gate fails. Pull requests keep
running every suite to the end.

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

Cancelling a workflow run gives each gate job that has not run the conclusion `cancelled`, and the
queue treats a cancelled required check as a failure, so the entry is ejected within one poll of the
first failure. The failed job keeps its `failure` conclusion, so
[ejection triage](../../../prompts/automation/merge-queue-ejection.md) and
[Cancel Dequeued Merge Group Runs](reference-merge-queue-run-cancellation.md#dequeued-pull-requests)
still see the evidence; only the run-level conclusion becomes `cancelled`.

A failure in a job no gate waits on (the coverage upload and the informational credentialed suites)
does not eject an entry today, so the watcher ignores those jobs. Its workflow test keeps the
watched workflows and the ignored jobs equal to what the required gates actually wait on.

The watcher is never a required check, so its own failure cannot eject an entry. Cancel Replaced and
Cancel Dequeued Merge Group Runs already cancel a superseded entry's watcher with its other runs.

## Policy exception and rejected alternatives

The canonical Actions checklist forbids polling workflow state and asks for event-driven phases.
Actions offers no event for this. A job cannot start when a sibling job fails, and the Checks events
of Actions-created runs do not trigger workflows. The watcher is a scoped exception: one small
request per poll for the whole entry, run on the smallest runner in sequential matrix legs so each
job stays within the ubuntu-slim platform cap and the repository's job timeout budget.

- **A cancel step in every job** (`if: failure()` on merge groups) is event-driven, but every job in
  the merge-group graph would need `actions: write`, including on pull-request runs, because job
  permissions cannot depend on the event. Every new job would also have to remember the step.
- **Making each suite a required check** would let the queue eject on the first failure natively,
  but it replaces the stable area gates with a required-check list that changes with every job.
- **Synthesizing a failed required check** through the Checks API is forbidden by the canonical
  checklist: workflow code must not publish a check run to stand in for a required context.
