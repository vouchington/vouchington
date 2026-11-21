Review backend queues and workers. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Unit: one queue and its worker.

Load `voucha-queue-authoring`, `glide-mq`, and `queue-rules`; follow [backend-queues.md](../../checklists/backend-queues.md).

- Trace queue and worker sources to runtime registration: named-export consumers, operator catalog parity, and membership in the applicable worker policy, not matching names alone.
- Fire-and-forget enqueue, publish, or signal calls need `.catch(onError)` or a justified benign catch.
- Delayed jobs revalidate the recipient at processing time, bound the claimed-time window, and exclude soft-deleted, restricted, and suspended recipients.
- Database writes stay durably discoverable when a follow-up enqueue is deduplicated, suppressed, or fails. The queue self-heals from durable state through a scheduler and admin backfill (cursors advance only after awaited bulk enqueue success), or has a documented accepted-loss contract.
- Each logical job derives a stable `jobId` from database columns plus task intent, uses it as the simple dedup ID, and stays processor-idempotent under duplicate delivery. `simple` dedup tests assert options or app behavior, not GlideMQ internals.
- External delivery is retryable or at-most-once. At-most-once flows persist an attempt marker immediately before the provider boundary and terminally skip; retryable flows stay eligible. Test provider failure against that contract.
- Keep queue, worker, service, and docs cross-links aligned; validate with targeted tests and package-shape checks.
