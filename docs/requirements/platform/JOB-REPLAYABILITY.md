# Job Replayability & Idempotency

glide-mq runs on Valkey, which is treated as ephemeral. If Valkey loses all data, every job must be
re-enqueueable and the system must converge back to its correct state from the Postgres source of
truth. Two requirements enforce this.

1. **Idempotency.** Every job handler is safe to run more than once. Handlers that write to Postgres
   use upserts, content-sha guards, or uniqueness constraints, and document the mechanism in the
   service function comment.
2. **Backfill.** Every replayable queue registers a backfill entry that scans Postgres and enqueues
   jobs for every entity missing a derived result. Backfills are triggerable from the admin queue
   page.

## Rules for new jobs

- Side-effecting external sends (email, push, SMS, third-party webhooks) are excluded from replay,
  because replaying them would duplicate user-visible effects. Document the exclusion and reason.
- Every queue needs a non-dead-letter recovery path, because queues here keep no dead-letter queue
  and a terminally failed job is trimmed. Acceptable answers are a registered backfill, a
  self-healing dispatcher or reconciler whose next run recovers missed work, or an explicit
  accepted-loss record. "It used to land in the DLQ" is not a recovery path.
- A backfill only counts if its re-enqueue really succeeds. A stable custom `jobId` on a queue with
  numeric retention silently no-ops the re-enqueue once the prior job finished, because the id's
  uniqueness claim outlives the job. Let deduplication collapse in-flight duplicates instead. See
  [define a replay-safe job](../../checklists/reference-backend-queues-define-a-replay-safe-job.md#define-a-replay-safe-job).
- The registry test validates structure, not completeness against the queue list; keeping the
  registry complete is a review responsibility.

Vote-weight dispatchers persist independent positions for age, membership expiry, and family-source
signals. Their backfills resume bounded windows; child jobs use entity-and-event ids and can
reactivate retained terminal records. Family timestamp branches retain their own keysets until
all branches finish, and only then commit the dispatch position. Direct account changes enqueue a
new event, while an operator force request can reactivate its stable id.

See also the [backend queue reference](../../overview/architecture/queues/README.md).
