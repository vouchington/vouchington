# Merge Queue Run Cancellation

GitHub's merge queue never cancels the workflow runs of an entry it stops waiting for. Two
workflows do that here: [Cancel Replaced Merge Group Runs](../../../../.github/workflows/cancel-replaced-merge-group-runs.yml)
for entries that are rebuilt, and
[Cancel Dequeued Merge Group Runs](../../../../.github/workflows/cancel-dequeued-merge-group-runs.yml)
for pull requests that leave the queue. Neither is a required check, so a failure in either cannot
eject an entry.

## What happens in the queue

The queue builds each entry on a speculative branch named `gh-readonly-queue/main/pr-<N>-<sha>`.
That branch holds the base branch, every entry ahead of it, and the pull request, and it starts the
`merge_group` runs for that entry. Entries A, B and C are built in parallel: B's branch contains A
and B, and C's contains A, B and C.

When B leaves the queue, C can no longer merge on its branch because that branch contains B. GitHub
rebuilds C on a new branch containing only A and C, and requests checks for it. Two sets of runs are
then left behind:

- C's old runs keep running although that entry can never merge.
- B's own runs keep running too: B left the queue, so GitHub never requests checks for it again.

Each leftover run holds a hosted runner until it finishes or times out.

## Why GitHub does not cancel them

- The queue is CI-provider-agnostic. It waits for the required checks of each entry and does not
  know which workflow runs produced them.
- Actions treats every queue branch as an independent ref, so nothing links C's old branch to its
  new one.
- `concurrency:` cannot express the relationship. The `merge_group` payload has no pull-request
  number, the branch name embeds a SHA that changes on every rebuild, and expressions have no
  substring or regular-expression function to extract `pr-<N>` from the name. A constant group
  would cancel the parallel builds of other entries that should keep running.
- Others hit the same gap: [community discussion #63136](https://github.com/orgs/community/discussions/63136),
  [#5435](https://github.com/orgs/community/discussions/5435), and the
  [Chapel report](https://chapel.discourse.group/t/chapel-merge-cancel-superseded-or-destroyed-merge-group-workflow-runs/51428).
  Chapel's [workflow](https://github.com/chapel-lang/chapel/blob/main/.github/workflows/trigger-pr-checks.yml)
  subscribes to the undocumented `merge_group` activity type `destroyed` and keys `concurrency` on
  `github.event.merge_group.head_ref`.

Neither workflow here uses `merge_group: destroyed`. The Actions documentation lists only
`checks_requested` for `merge_group`, and the pinned actionlint rejects `destroyed`. The documented
`pull_request_target` `dequeued` event covers the removal case instead.

## Two mechanisms

Cancel Replaced Merge Group Runs triggers on `merge_group` `checks_requested` and cancels active
runs on older `pr-<N>-*` branches of the same pull request. Cancel Dequeued Merge Group Runs triggers
on `pull_request_target` `dequeued` and cancels active runs on the dequeued pull request's branches.
Both match by branch prefix with the trailing hyphen so that `pr-14-` never matches `pr-140-`, and
both skip runs whose id is not lower than their own.

## Dequeued pull requests

The dequeued workflow runs from `main`'s workflow file and checks out nothing. The pull-request
number and the removal reason reach the script only through `env:`, and the token holds
`actions: write` and `pull-requests: read` for this one job. Guards, in order:

1. **Reason allowlist.** Only reasons that mean the entry will not merge cancel runs. `MERGE`,
   `ALREADY_MERGED`, and unexplained reasons never act, and `CI_TIMEOUT` never acts because the
   timed-out runs are the evidence. A reason GitHub adds later is ignored until someone decides
   what it means.
2. **Merged pull request.** The script reads the pull request through the API and does nothing when
   it is merged, because merge-group-only jobs such as image publishing must finish for a merged
   group. `ROLL_BACK` is the ambiguous reason; this guard makes acting on it safe either way.
3. **Failure evidence.** [Merge Queue Ejection](../../../../.github/workflows/merge-queue-ejection.yml)
   dispatches a triage session for `CI_FAILURE` and `CI_TIMEOUT`, and its
   [prompt](../../../prompts/automation/merge-queue-ejection.md) reads the group's runs because the
   newest group's "failed or timed-out runs caused this ejection". Cancelling a run changes its
   run-level conclusion to `cancelled` even when one of its jobs failed. A `CI_TIMEOUT` removal
   leaves timed-out runs still active, so the reason is excluded. Any run that already holds a
   `failure` or `timed_out` job is kept for the same reason and reported as kept.
4. **Run order.** Only runs with an id lower than the cancelling run's are cancelled. GitHub reuses
   a queue branch name when the pull request is re-enqueued onto the same parent commit (observed,
   not documented), so the branch name alone cannot tell old runs from the new entry's runs. A
   re-enqueue follows the dequeue, so the new entry's runs get higher ids. The remaining race is a
   re-enqueue whose runs are created before the cancelling run is, which would cancel the new entry
   and eject it again; it is unlikely because the dequeue event starts the cancelling run first.
