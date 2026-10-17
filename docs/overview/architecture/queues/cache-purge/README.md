# Cache Purge Queue

Source entrypoint: [backend/queues/cache-purge/README.md](../../../../../backend/queues/cache-purge/README.md)

Purges Cloudflare Workers Cache (GA) Cache-Tags on the edge when a post, topic, or user
is created, updated, or deleted. Wired from `@services/entity-cache/invalidate.mts`'s
`posts`/`topics`/`users` wraps — the same three wraps that already invalidate the backend's
Valkey entity cache on content edits.

Vote/election mutations (`invalidate.post_elections`, `invalidate.topic_elections`, etc.) do
**not** enqueue purges: votes are much higher-frequency than content edits, and purging the
full cached HTML page on every vote would fight the point of caching. See
[`@ts-shared/cache/cache-tags.mts`](../../../../../ts-shared/cache/cache-tags.mts) for the tag scheme.

## Queue Configuration

### Domain: `cache-purge`

Domain `cache-purge` of the shared [`background` queue](../background/README.md); job names are
`cache-purge.<name>`. The domain is capped as a whole: one `domain` group of concurrency 5 and a
rate limit of 4 starts per 60 seconds, shared by every worker replica through the ordering key
`cache-purge`. Its jobs carry no other ordering key. It adds a worker baseline of five.
`WORKER_CONCURRENCY_CACHE_PURGE` and the old queue no longer exist.

- `cache-purge.processPurgeCacheTag` — POSTs up to `MAX_TAGS_PER_REQUEST` (30, see
  [`ts-shared/cache/purge.mts`](../../../../../ts-shared/cache/purge.mts)) Cache-Tags per job to the
  worker's `/infra/cache-purge` route via `@services/entity-cache/purge.mts`'s `purgeCacheTags`.
  `enqueueBulkPurgeCacheTags` chunks its input into `<=30`-tag groups before enqueueing — one job
  per chunk, one outbound HTTP call per job — instead of one job per tag. This exists because
  Cloudflare Workers Cache `ctx.cache.purge()` always uses Free-tier limits (5 req/min, burst 25)
  regardless of zone plan — not the zone Pro 5/s cap. Exploding every tag into its own job let a
  burst of content mutations empty that bucket. The domain's `CACHE_PURGE_RATE_LIMIT`
  (`4` req/min; see [`cache-purge-jobs.mts`](../../../../../backend/queues/background/enqueues/cache-purge-jobs.mts))
  is the actual cross-instance throttle, replacing the old queue's worker `limiter`: GlideMQ's
  group rate limit is Valkey-keyed, so it caps the aggregate outbound rate across every worker
  replica, not per-instance. A deferred job waits in its group without spending an attempt.
- Debounced per-chunk (5s TTL): a repeat enqueue only collapses into the same job when it produces
  the exact same sorted chunk of tags, narrower than the old per-tag dedup (an overlapping-but-
  not-identical chunk no longer collapses). This is an accepted, minor regression in dedup
  granularity — worst case a few extra purge calls, never fewer purges than needed — and is
  dominated by the call-volume reduction from batching itself (e.g. one post edit producing 3 tags
  goes from 3 jobs/3 HTTP calls to 1 job/1 call).
- Replayability: the handler is idempotent under the canonical `{ tags: string[] }` payload;
  purging the same Cache-Tags twice is a no-op on Cloudflare's side, so a retried job is safe.

## Related

- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
- Entity cache service: [../../services/entity-cache/README.md](../../services/entity-cache/README.md)
- Worker purge route: [../../../cloudflare-worker/src/cache-purge-route.mts](../../../../../cloudflare-worker/src/cache-purge-route.mts)
