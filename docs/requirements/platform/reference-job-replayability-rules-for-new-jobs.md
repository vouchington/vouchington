# Job Replayability & Idempotency reference

[Back to Job Replayability & Idempotency](JOB-REPLAYABILITY.md)

## Rules for New Jobs

When adding a new job handler:

1. **The handler MUST be idempotent.** Document the idempotency mechanism (upsert,
   sha guard, uniqueness constraint, or explicit skip-if-exists check) in the
   service function comment.

2. **A replayable queue MUST register a `BackfillEntry`.** Add it to the appropriate
   `backfills-*.mts` file (parallel structure to `scheduled-jobs-*.mts`) so it
   appears in the Backfills section at `/admin/queues`.

3. **Side-effecting external sends** (email, push, SMS, webhooks to third parties)
   are **explicitly excluded**. Document the exclusion by adding a row in the
   "Non-Replayable Queues" table above with the reason.

4. **Every queue MUST define a non-DLQ recovery path.** GlideMQ queues in this codebase carry no
   dead-letter queue — a terminally failed job is trimmed after `removeOnFail: 100` with nothing
   left to inspect or replay. Document one of: a registered `BackfillEntry` that re-derives the job
   from Postgres, a self-healing dispatcher/reconciliation job whose next run naturally recovers
   missed work (e.g. `reconcileFollow` re-deriving desired state on every run), or an explicit
   accepted-loss row in the "Non-Replayable Queues" table above. Record the answer in the "Notes"
   column of the Queue Replayability Matrix below. "It used to land in the DLQ for manual replay"
   is not a recovery path.
   A registered `BackfillEntry` only satisfies this rule if its re-enqueue actually succeeds: a
   stable custom `jobId` on a queue with numeric `removeOnComplete`/`removeOnFail` retention
   silently no-ops the backfill's re-enqueue (GlideMQ returns `null`) once the prior job has
   finished, because the id's uniqueness claim outlives the job until enough newer terminal jobs
   trim its record. See [Define a replay-safe
   job](../../checklists/reference-backend-queues-define-a-replay-safe-job.md#define-a-replay-safe-job)
   for the retention-window mechanics and required mitigation.

Enforcement: `backend/api/v1/mq/__tests__/backfills-registry.test.mts` validates
registry structure (unique IDs, required fields, trigger functions). It does not
yet verify completeness against a canonical queue list — that is tracked by the
TODO rows in the matrix table above. When all queues have backfills registered, a
completeness assertion should be added to enforce the guarantee programmatically.
