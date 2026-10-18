# Transient-Retry Rule Catalogue

Source entrypoint: [ci/transient-retry/README.md](../../../../ci/transient-retry/README.md). The
rules live in `ci/transient-retry/rules.mts`, and the scoped
[invariants](../../../../ci/transient-retry/AGENTS.md) govern changing them. Automatic `main`
recovery is off unless both Harness gates are enabled; the manual helper for non-`main` PR branches
always works.

## Design rationale

- Never pin a `describe`/`it` title string or a raw timeout digit count in a matcher. A project's
  own `testTimeout` owns that number, and a title drifts on rename with zero test signal. A matcher
  that required a stale timeout literal went silently dead for months because its own fixture
  synthesized the same stale digits. Match on markers the failing tool owns instead. A pinned title
  or timeout digit count has no automated guard, which is why pinning is disallowed outright.
- No rule reruns a live-provider failure. Those jobs are informational smoke checks that never gate
  CI, so an automatic rerun gains nothing
  ([live-provider smoke checks](../../tests.md#live-provider-smoke-checks)). Shared
  infrastructure rules can still rerun them because they also guard gating jobs.
- A job-level timeout match is unsafe for a heterogeneous job, because it would rerun real code-bug
  deadlocks. A timeout rule must prove the job is homogeneous by config or pin the owning
  project's boundary.
- One root cause is one rule, even when it surfaces as different HTTP statuses, `curl` exit codes,
  step timeouts, or asset paths. Broaden by keeping the consumer's terminal failure marker as the
  anchor, because it proves the failure happened in the right job, then OR together the transient
  variants. For multi-error logs, require every error block to match a transient predicate so a
  genuine error mixed into the set is never silently rerun.
- Dispatch re-reads the source run before it acts, and escalation repeats that check. A rerun that
  has already started makes the failed attempt stale, so an obsolete attempt must neither dispatch
  a fix nor open a needs-human issue. Unreadable state stops the path instead of guessing.
- Attempt accounting is replayed from prior attempts, and evidence that cannot be fetched degrades
  to a conservative shared count rather than an optimistic per-rule one.

## Runbook for non-`main`, non-Dependabot PR branches

1. Read the rules before writing a code fix. A failure with the same conclusion, failing jobs, and
   log fingerprint as an existing rule is known-transient.
2. Confirm and rerun with `node ci/transient-retry/rerun-known-transient.mts <run-id>` instead of
   matching by hand and calling `gh run rerun`. An unmatched failure is a real failure until a rule
   with a real-log fixture says otherwise.
3. For a new transient pattern, add a rule in your PR.

A rerun replays the same head SHA against the same base merge, so if a shard keeps failing
identically and `origin/main` has moved, rebase and push instead. Every rerun creates a new
attempt and is not idempotent: do not start one while another is in progress or after cancelling
the run, because overlapping attempts race and their recorded state can disagree.
