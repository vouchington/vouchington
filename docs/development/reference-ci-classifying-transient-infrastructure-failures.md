# Classifying Transient Infrastructure Failures

[Back to CI Reference](ci.md#classifying-transient-infrastructure-failures)

Before rerunning a failed CI job, confirm the failure matches a known infrastructure signature
**and** that the latest runs on the target branch are green. A look-alike failure that matches
your diff is a real bug; do not rerun it. On non-`main`, non-Dependabot PR branches, once you
have confirmed the run matches a known-transient fingerprint, use
`node ci/transient-retry/rerun-known-transient.mts <run-id>` instead of manually matching rules
and calling `gh run rerun`.

Automatic `main` recovery runs only while `HARNESS_DISPATCH_ENABLED` and
`HARNESS_FIX_MAIN_ENABLED` are both exactly `true`. When either is unset, `fix-main.yml` does not
classify failures, rerun workflows, or dispatch Harness. The manual PR-branch helper above remains
available independently.

The catalogue, its ordering, and its accounting live in
[`ci/transient-retry/`](ci/transient-retry/README.md). Why a catalogue entry is trustworthy:

- Every rerun rule has its own `maxAttempts` budget, and only a rule that wins ordered evaluation
  increments its counter, so unrelated failures never consume it.
- A bare job-timeout kill has no auto-rerun rule. A timeout inside one job gives no evidence that
  separates an infrastructure stall from a real code-bug deadlock, so ambiguous timeouts dispatch
  for investigation instead.
- A cancelled idempotent workflow with no failed-job signal is ignored rather than dispatched.
  An unexplained non-143 exit code is a real failure, not a runner shutdown.
- The `runner-shutdown-leaf-rerun` rule reruns a cleanly cancelled idempotent leaf job only when
  complete logs exist and show no OOM, application, setup, or non-SIGTERM failure evidence.
- A backend unit shard that fails with `Worker exited unexpectedly` after every test passed is a
  teardown race, not a worker crash, and no rule reruns it. See
  [Graceful Shutdown § Test Teardown](../overview/architecture/graceful-shutdown.md#test-teardown).
- Only rules whose workflow and job predicates match a current subscribed main producer can trigger
  Fix Main auto-reruns.

To add a signature, include a real log fingerprint, counterfixtures for look-alikes, and
`exampleRunIds`; a successful manual rerun alone cannot satisfy completion.
