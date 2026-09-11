# Post publication worker

The worker serially drains coalesced publication repair work. It expands only current primary
state, applies strict cache, rating, and sitemap effects, and advances the leased generation's
parent cursors only after those effects succeed. A failed effect leaves the repair request intact
for a safe retry.

Receipt-only hard deletes drain in bounded pages before topic and retained-identity phases. Each
generation-fenced receipt deletion makes the next page visible, while a stale lease leaves the
current page intact for retry.

Owns the thin globally serial worker for durable post-publication reconciliation. The processor never sends notifications or push messages; it only applies replay-safe cache, rating and sitemap projections before the exact-generation acknowledgement.

| Transition mode              | Durable state before effect                      | Required outcome                                                                                                   | Evidence                                                          |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Dispatch failure             | Dirty work is unclaimed                          | Scheduler retry or five-minute dispatcher claims the unchanged generation.                                         | `enqueueReconcilePostPublication` uses durable throttle dispatch. |
| Provider non-consumption     | Queue job exists; dirty work is unclaimed        | No projection occurs; the durable row remains claimable after queue recovery.                                      | Reconciliation always starts from PostgreSQL dirty work.          |
| Consumption + commit failure | Leased generation; projection or enqueue throws  | No receipt, cursor, or ACK is written; lease release makes the work retryable.                                     | Processor failure-path tests.                                     |
| Commit + reply loss          | Projection/receipt committed; job may replay     | Receipt upsert and idempotent projections make replay safe before fenced ACK.                                      | Receipt and replay tests.                                         |
| Replay                       | Same generation is delivered again               | Reapply cache/rating/sitemap effects safely; receipt remains one current value.                                    | Processor replay test.                                            |
| TTL expiry                   | Throttle dispatch key expires                    | Dispatcher may enqueue a fresh serialized drain; dirty work remains the source.                                    | Queue enqueue options test.                                       |
| Orphan cleanup               | Lease holder dies or continuation fails          | Lease expiry or release exposes unchanged work; no cursor/ACK is advanced early.                                   | Lease/continuation-failure tests.                                 |
| Normal removal               | Final post, orphan, topic, and key pages succeed | Non-deduplicated sitemap and continuation jobs are durably accepted, then exact generation/token ACK removes work. | Processor final-page and sitemap enqueue tests.                   |

Review succession runs before the post-session lock phase. If it writes an automatic archive or
restore, the old claim remains unacknowledged and a continuation retries against the newly committed
canonical state; no projection or receipt is applied from the stale selection.

Shadow scan counts cover every examined candidate, while discrepancy counts cover only candidates
whose receipts drift from canonical state. Both categorize candidate posts by author, community, and
RSS-source membership; neither counts unique scope entities or independent scope receipts.
The shadow-audit processor chains every full page: repairs advance their durable checkpoint, while
read-only dry runs carry their UUID cursor in the next ordered job.

The review-succession-history processor is globally ordered and read-only: it only chains the next
frozen-cutoff page and never repairs archive history.

## Review succession history audit transitions

| Failure mode                                       | Detectable state                                       | Recovery/reconciliation path                                                              | Idempotency guarantee                            | Evidence (test)                                     |
| -------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| Dispatch failure                                   | No audit job is accepted                               | Operator retriggers the dry run                                                           | Read-only first page chooses a new cutoff        | `backend/queues/post-publication/enqueues.test.mts` |
| Provider non-consumption                           | Job exists without output                              | Queue recovery redelivers it                                                              | Cursor and cutoff fully describe the page        | `review-succession-history.test.mts`                |
| Provider consumption followed by DB-commit failure | Not applicable; the audit performs no PostgreSQL write | Retry the same job                                                                        | Reads are repeatable and mutation-free           | `review-successions/audit.test.mts`                 |
| Durable commit followed by reply loss              | Continuation may exist while the prior result is lost  | Re-run the same page for reporting                                                        | Repeated reads and ordered continuation are safe | `review-succession-history.test.mts`                |
| Retry/reconciliation                               | Same cursor and cutoff are delivered again             | Processor re-reads and may enqueue the same next page                                     | No repair or checkpoint mutation                 | `review-succession-history.test.mts`                |
| TTL expiry                                         | No custom deduplication claim exists                   | Operator or prior page may enqueue again                                                  | Page identity is the payload                     | `backend/queues/post-publication/enqueues.test.mts` |
| Orphan cleanup                                     | A chain stops before its final short page              | Restart from the operator surface; retain the original cutoff only when manually resuming | Read-only pages cannot corrupt source state      | `review-succession-history.test.mts`                |
| Normal terminal removal                            | Final page has `hasMore=false`                         | No continuation is enqueued                                                               | Final short page is stable for the frozen cutoff | `review-succession-history.test.mts`                |
