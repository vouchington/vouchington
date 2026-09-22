# Systems Summary

All active workers, classified by
[`worker-queue-policy.json`](../modules/worker-queue-inventory/worker-queue-policy.json), plus a
processor reference with default priorities. Infrastructure decides the deployed worker topology;
local development runs one [`worker-cpu`](../entrypoints/worker-cpu/README.md) process for all
policy-managed queues.

## Contents

- <a id="active-workers"></a>[Active Workers](reference-active-workers.md)
- <a id="processor-reference"></a>[Processor Reference](reference-processor-reference.md)
- <a id="terminal-failure-recovery"></a>[Terminal Failure Recovery](reference-terminal-failure-recovery.md)
- <a id="queue-configuration-reference"></a>[Queue Configuration Reference](reference-queue-configuration-reference.md)
- <a id="flowproducers"></a>[FlowProducers](reference-flowproducers.md)
- <a id="membership-refund-reconciliation"></a>[Membership Refund Reconciliation](memberships/reference-refund-reconciliation.md)
- <a id="related"></a>[Related](reference-related.md)

## Post publication reconciliation

[`post-publication`](post-publication/README.md) is an IO worker queue with one global
reconciliation ordering key. Its five-minute scheduler and operator backfill drain
`post_publication_dirty_work`; the processor applies only replay-safe cache, topic-rating, and
sitemap projections before its generation-fenced acknowledgement. See the
[worker contract](../workers/post-publication/README.md) for lease and retry semantics.
The dispatcher uses an expiring throttle without a stable terminal job ID, keeping later operator
and backfill triggers replayable even while completed job history is retained.
Its operator-triggered shadow audit chains bounded pages with the same ordering key: repairs use a
durable checkpoint, while dry runs pass their read-only UUID cursor in the continuation payload.

## Story post related URL projection

[`story-post-related-url-projections`](story-post-related-url-projections/README.md) is an IO worker
queue that converges a story post to the complete active set of eligible story-member URLs. Story
mutations persist generation-fenced work in PostgreSQL before enqueueing; each job scans or prunes
one bounded page, and the five-minute scheduler recovers missed or terminal enqueues.
