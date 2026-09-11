Review backend queues and workers. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check idempotency, retry behavior, scheduling, worker shutdown, queue configuration, and required package shape.
- Trace queue or worker sources to their runtime registration: verify named-export consumers, operator catalog parity, and membership in the applicable worker policy rather than relying on matching names alone.
- Verify deduplication is used as an enqueue optimization only: `simple` dedup tests should assert options or app behavior, not GlideMQ internals across concurrent/repeated round trips.
- Check intentional fire-and-forget enqueue, publish, or signal calls for `.catch(onError)` or a clearly justified benign catch.
- Audit delayed jobs for processing-time recipient revalidation, explicit claimed-time window bounds, and soft-deleted/restricted/suspended recipient exclusion.
- Verify database writes remain durably discoverable when a follow-up enqueue is deduplicated, suppressed, or fails; queue state must not be the only recovery signal.
- Verify every queue self-heals from durable state through an automatic scheduler and admin backfill, or has a documented accepted-loss contract. Recovery cursors advance only after awaited bulk enqueue success.
- Verify every logical job derives a stable `jobId` from database columns plus task intent, uses the same simple deduplication ID, and remains processor-idempotent when duplicate delivery still occurs.
- For external delivery, identify whether the contract is retryable or at-most-once. Test provider failure and the contract-specific retry or reclaim outcome: at-most-once flows must persist an attempt marker immediately before the provider boundary and terminally skip, while retryable flows must remain eligible.
- Prefer fixes that reduce duplicate work, improve recovery, or make failures more observable.
- Keep queue, worker, service, and docs cross-links aligned.
- Validate with targeted queue/worker tests and static package-shape checks.
