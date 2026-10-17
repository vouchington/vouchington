# Systems Summary

Source entrypoint: [backend/queues/README.md](../../../../backend/queues/README.md)

The [Bedrock batch queue](bedrock-embeddings-batch/README.md) also runs four provider-free
reconciliation roots. They copy reusable text embeddings and recover post follow-up delivery
in bounded pages, independent of Bedrock capacity.

Media-registry recovery in the [notifications domain](notifications/README.md) dispatches bounded
pages through cutoff-scoped continuation jobs. Its durable registry terminalizes abandoned final
claims for operator replay; continuation retries preserve the same cursor and cutoff. See the
[media-delivery safety protocol](../services/media-delivery-safety/README.md).

All active workers, classified by
[`worker-queue-policy.json`](../../../../backend/modules/worker-queue-inventory/worker-queue-policy.json), plus a
processor reference with default priorities. Infrastructure decides the deployed worker topology;
local development runs one [`worker-cpu`](../backend/entrypoints/worker-cpu/README.md) process for all
policy-managed queues.

The [crawl-dispatch queue](crawl-dispatch/README.md) schedules bounded due-hostname sweeps hourly. Retained jobs preserve their cutoff and index position across capped continuations.

The [URL/domain blacklist queue](urls-domains-blacklist/README.md) runs a five-minute
bounded sweep of durable hostname-policy cache invalidations after sync, staff block,
and unblock writers enqueue changed hostname IDs in PostgreSQL.

## Background queue

[`background`](background/README.md) is the shared IO queue for background domains of the same
shape, served by one [worker](workers/background/README.md) that dispatches by `<domain>.<name>`
through a registry. Pause, retry, and stats are per domain. Its page lists the domains it
carries.

## Vote aggregation

[`vote-aggregation`](vote-aggregation/README.md) combines election tallies, vote-weight and integrity work, topic ratings, entity-metric refreshes, and report integrity as a domain of the shared [`background`](background/README.md) queue (`vote-aggregation.<name>` jobs). Election tallies share the domain-wide group of 10; the user election fan-out and the report-integrity backfill enqueue one bounded page and continue through a cursor.

## Contents

- <a id="active-workers"></a>[Active Workers](reference-active-workers.md)
- <a id="processor-reference"></a>[Processor Reference](reference-processor-reference.md)
- <a id="terminal-failure-recovery"></a>[Terminal Failure Recovery](reference-terminal-failure-recovery.md)
- <a id="queue-configuration-reference"></a>[Queue Configuration Reference](reference-queue-configuration-reference.md)
- <a id="membership-refund-reconciliation"></a>[Membership Refund Reconciliation](memberships/reference-refund-reconciliation.md)
- <a id="related"></a>[Related](reference-related.md)

## Post publication reconciliation

[`post-publication`](post-publication/README.md) is a domain of the shared `background` queue with one
domain-wide serial group. Its five-minute scheduler and operator backfill drain
`post_publication_dirty_work`; the processor applies only replay-safe cache, topic-rating, and
sitemap projections, including landing-pages family refreshes for review targets, before its
generation-fenced acknowledgement. See the
[worker contract](workers/post-publication/README.md) for lease and retry semantics.
The dispatcher uses an expiring throttle without a stable terminal job ID, keeping later operator
and backfill triggers replayable even while completed job history is retained.
Its operator-triggered shadow audit chains bounded pages in the same group: repairs use a
durable checkpoint, while dry runs pass their read-only UUID cursor in the continuation payload.

## Story post related URL projection

[`story-post-related-url-projections`](story-post-related-url-projections/README.md) is a `background`
domain that converges a story post to the complete active set of eligible story-member URLs. Story
mutations persist generation-fenced work in PostgreSQL before enqueueing; each job scans or prunes
one bounded page, and the five-minute scheduler recovers missed or terminal enqueues.

## Self-continuations under GlideMQ deduplication

GlideMQ skips a `simple` or `debounce` add while the job holding that dedup id is waiting or
active, so a processor must not enqueue its own continuation under the id its active job holds.
[`follower-distributions`](follower-distributions/README.md) continues inside the same job
(`moveToDelayed`), keeping its single dedup id.
[`crawl_urls`](crawler/README.md) keys each 429 rate-limit replacement by its retry count
(`crawl_url_ratelimit__<urlId>__<n>`) and fails the job, so GlideMQ retries it, when the
replacement add returns no job.

Operator media-registry replay uses the [notifications domain](notifications/README.md#media-delivery-replay) to reopen one UUID page per job, preserving the actor across awaited continuations.
