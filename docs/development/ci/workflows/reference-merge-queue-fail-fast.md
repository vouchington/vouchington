# Merge Queue Fail Fast

Each required area gate (`static`, `backend`, `web`, `cloudflare-worker`, `lambdas`, `tooling`,
`gitleaks`) `needs` every suite in its area, so a merge-group failure ejects the entry only after
the slowest suite ends, and every entry queued behind it is rebuilt late. On a
`merge_group` event a failing suite job now cancels its own run, and the gate fails on the real
failed job straight away. Pull requests are unchanged. No schedule, sweep, or poll is involved: the
failing job reacts to its own failure.

## How it works

1. **Self-cancel step.** Every gate-feeding suite job ends with a step that runs only when
   `failure() && github.event_name == 'merge_group'` and calls `gh run cancel` on `github.run_id`
   with the job's own token. It is the last step, so JUnit, LCOV, and log uploads (which run on
   `!cancelled()` or `failure()`) finish first.
2. **Gate condition.** Each gate uses
   `if: ${{ !cancelled() || github.event_name == 'merge_group' }}`. A cancelled merge-group run
   still evaluates the gate, which reads its `needs` and fails on the failed job, so the queue
   ejects the entry as `CI_FAILURE`. A pull-request run keeps `!cancelled()`.
3. **Permissions.** The step needs `actions: write`. It is granted at job level on the suite job
   only (the job's other permissions are restated, since a job-level block replaces the rest). A
   caller of a reusable workflow caps what the callee jobs may request, so each caller job above
   such a suite also lists `actions: write`, up to `nightly.yml`. The image publishers' `build`
   jobs have no `permissions:` of their own and inherit their caller's envelope, so only the
   merge-group callers (`publish-backend-images`, `publish-web-images`) gain it; the pull-request
   `validate-*-images` callers keep `actions: read`.
4. **No persisted token.** A job that can write through `GITHUB_TOKEN` must not leave it in `.git`, so every checkout in a self-cancelling job sets `persist-credentials: false` (the `github-actions-checkout-credentials` rule).

The step lives in the reusable suite workflows (`tests-*.yml` and friends), not in a caller:
a caller job that `uses:` a workflow cannot have steps, and a caller-side job would fire only once
the whole callee finished, which is the delay this removes. `github.run_id` and
`github.event_name` in a called workflow are the caller's, so the step cancels the area run.

## Which jobs cancel

The drift guard [`merge-group-self-cancel.test.mts`](../../../../.github/workflows/merge-group-self-cancel.test.mts)
derives the jobs from the area workflows. Gate-feeding suite jobs cancel, and so do their
sharding and seed jobs, because a failed `prep`, `shards`, or `seed-explain` job skips only its own
dependents while sibling suites keep the gate waiting. These do not:

- **Informational jobs** such as `codecov`, `coverage` (pull requests only), and the credentialed
  suites. A failure keeps its own check red but must not eject an entry.
- **Static checks and change detection.** Every suite waits on its area's static checks, so a
  failure skips the rest and the run ends at once.
- **`prepare-postgres`.** The workflow is shared with informational callers, which must not cancel
  the run, so a failure there leaves sibling suites running until they finish. This is a known gap.
- **`resolve-main-images`**, which runs on pushes to `main` only.
- **`gitleaks`.** Its scan is a pinned external reusable workflow this repository cannot edit.

## Edge cases

- **Cancel races a finished job.** The cancel request can land after the run completed, or a
  sibling already cancelled it. `gh run cancel` then errors; the step reports a warning and
  succeeds, and the job keeps the result of its real failure.
- **The cancelling job's own result.** Cancelling stops the job that issues it, so that job is
  expected to report `cancelled` rather than `failure` (not yet observed live). The gate still
  fails because the required-result gate accepts only `success` or `skipped`, and a failed sibling
  keeps `failure`. When triaging an ejection, read the run's failed jobs and steps, not only the run
  conclusion, as the [merge-queue-ejection prompt](../../../prompts/automation/merge-queue-ejection.md)
  says.
- **Job timeouts.** A timed-out job ends as `cancelled`, so `failure()` is false and no self-cancel
  happens; that entry waits as before.
- **Re-run of failed jobs.** A re-run starts a new attempt of the same run on the same event, so a
  merge-group re-run can self-cancel again on a second failure. Re-running failed jobs of an already
  cancelled run therefore behaves like the first attempt.
- **Dead entries.** [Cancel Replaced and Cancel Dequeued Merge Group Runs](reference-merge-queue-run-cancellation.md)
  cancel runs of entries that are rebuilt or leave the queue. Their cancelled runs now also run the
  gate, which fails; the entry is already out, so that is one short job. Their guards keep a run
  that already holds a `failure` job, which includes runs this step cancels.
- **Pull requests.** The step cannot cancel a pull-request run: its condition requires
  `merge_group`, and a pull-request run has no ejection to speed up. Authors want every failure
  from one run, and a fork PR token could not hold `actions: write` anyway.
