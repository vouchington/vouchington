# Cache Purge Queue

Purges Cloudflare Workers Cache (GA) Cache-Tags on the edge when a post, topic, or user
is created, updated, or deleted. Wired from `@services/entity-cache/invalidate.mts`'s
`posts`/`topics`/`users` wraps — the same three wraps that already invalidate the backend's
Valkey entity cache on content edits.

Vote/election mutations (`invalidate.post_elections`, `invalidate.topic_elections`, etc.) do
**not** enqueue purges: votes are much higher-frequency than content edits, and purging the
full cached HTML page on every vote would fight the point of caching. See
[`@ts-shared/cache/cache-tags.mts`](../../../ts-shared/cache/cache-tags.mts) for the tag scheme.

## Queue Configuration

### `cache-purge` (concurrency: 5, worker rate limit: 4 req/min)

- `processPurgeCacheTag` — POSTs up to `MAX_TAGS_PER_REQUEST` (30, see
  [`ts-shared/cache/purge.mts`](../../../ts-shared/cache/purge.mts)) Cache-Tags per job to the
  worker's `/infra/cache-purge` route via `@services/entity-cache/purge.mts`'s `purgeCacheTags`.
  `enqueueBulkPurgeCacheTags` chunks its input into `<=30`-tag groups before enqueueing — one job
  per chunk, one outbound HTTP call per job — instead of one job per tag. This exists because
  Cloudflare Workers Cache `ctx.cache.purge()` always uses Free-tier limits (5 req/min, burst 25)
  regardless of zone plan — not the zone Pro 5/s cap. Exploding every tag into its own job let a
  burst of content mutations empty that bucket. The worker additionally sets `CACHE_PURGE_LIMITER`
  (`4` req/min; see [workers.mts](../../workers/cache-purge/workers.mts)) as the actual
  cross-instance throttle — GlideMQ's limiter is Valkey-keyed by queue name, so it caps the
  aggregate outbound rate across every worker replica, not per-instance.
- Debounced per-chunk (5s TTL): a repeat enqueue only collapses into the same job when it produces
  the exact same sorted chunk of tags, narrower than the old per-tag dedup (an overlapping-but-
  not-identical chunk no longer collapses). This is an accepted, minor regression in dedup
  granularity — worst case a few extra purge calls, never fewer purges than needed — and is
  dominated by the call-volume reduction from batching itself (e.g. one post edit producing 3 tags
  goes from 3 jobs/3 HTTP calls to 1 job/1 call).
- Replayability: the handler stays idempotent under the new `{ tags: string[] }` payload the same
  way it was under the old `{ tag: string }` one — purging the same Cache-Tags twice is a no-op on
  Cloudflare's side, so a retried or replayed job is always safe.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Entity cache service: [../../services/entity-cache/README.md](../../services/entity-cache/README.md)
- Worker purge route: [../../../cloudflare-worker/src/cache-purge-route.mts](../../../cloudflare-worker/src/cache-purge-route.mts)
