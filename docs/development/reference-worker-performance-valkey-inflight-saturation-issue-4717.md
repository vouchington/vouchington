# Valkey Inflight Saturation (issue #4717)

[Back to Worker Performance](worker-performance.md#valkey-inflight-saturation-issue-4717)

Tracks Valkey inflight saturation in `workers-io` and the plan to reduce per-job Valkey request counts.

All per-job application-level Valkey calls — cache reads/writes, cache invalidations,
bloom-filter ops, rate-limiter checks — flow through two shared singleton
`GlideClient` instances:

- `cacheValkeyClient` — `readFrom: preferReplica`, default `inflightRequestsLimit: 1000`, default `requestTimeout: 250 ms`
- `rateLimiterValkeyClient` — `readFrom: primary`, same limits

When a client crosses 1000 in-flight commands, Glide hard-rejects with
`RequestError: Reached maximum inflight requests`. Jobs fail and retry via
glide-mq retry config. No buffering occurs at the Glide layer.

With ~30 workers at `baseline: 5` concurrency each, the process can hold ~150
concurrent job slots. Each slot may issue several commands: batched cache
invalidations, bloom rebuilds
(O(rows/10k) BF.MADD ops), and rate-limiter checks (1 Lua call each).

Per-worker call counts are documented in each worker package's
`VALKEY_REQUESTS.md`.

### Reduction roadmap

Ordered by leverage. Each change is a separate PR.

**1. Collapse multi-cache invalidation into one round trip (completed in #4778 plan)**

`invalidate.topics`, `invalidate.users`, `invalidate.posts`, and
`invalidate.urls` now use the upstream `ValkeyCache.deleteFromCaches()` helper
to invalidate all related keyspaces for an entity in a single cache-client Lua
call. This cuts a typical `entity-listeners` job from 2–3 cache invalidation
commands to 1.

Benefits: `entity-listeners`, `elections`, `openai-moderation`,
`article-sync`, `admin-imports`.

**2. Coalesce per-job command bursts with Glide Batch/pipeline**

Where a job issues several independent cache ops, send them as one pipelined
request. Best targets: `rss-feeds` (robots get + blacklist exists + item bloom
add), `post-mentions` (audit per-entity loops for `getBatch`/`setBatch`
consolidation).

**3. Merge web-risk rate-limiter double-call into one Lua script**

`assertUrlAllowedByWebRisk` runs `minuteLimiter.addAndCheck` + `monthLimiter.addAndCheck` =
2 `invokeScript` calls per crawl/rss-feeds job. Replace with a single
combined-window Lua script. Benefits: `rss-feeds`, all crawl workers.

**4. Break large fan-out jobs into smaller queued tasks**

`bloom-filters` (stream rebuilds, `batch: {size: 50}`) and
`urls-domains-blacklist` (BF.MADD by domain count) are the worst inflight
offenders. Mitigations:

- Smaller stream chunk sizes in rebuild jobs
- Per-shard rebuild (one queue job per bloom filter shard)
- Lower `batch.size` from 50 to 5–10

**5. Dedicated client for bloom/rebuild traffic (completed)**

All `ValkeyBloomFilter` instances now use `bloomValkeyClient` — a dedicated
`GlideClient` with its own inflight budget — instead of `cacheValkeyClient`.
The glide-mq command client Proxy is also wrapped with `retryOnInflightSaturation`
(~5s jitter, 3 attempts, saturation-only) so worker-internal stream ops retry
instead of failing jobs immediately.

### Environment knobs (Valkey inflight tuning)

| Env var                                | Description                                                                                                                                                                                                        | Default                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| `WORKER_QUEUE_INFLIGHT_REQUESTS_LIMIT` | Inflight limit for the glide-mq shared command client.                                                                                                                                                             | `1000`                   |
| `WORKER_QUEUE_REQUEST_TIMEOUT_MS`      | Request timeout for the glide-mq command client. Raise to `1000`–`2000` ms under sustained load.                                                                                                                   | `500`                    |
| `VALKEY_INFLIGHT_REQUESTS_LIMIT`       | Inflight limit for the `valkyries` app clients (`cacheValkeyClient`, `rateLimiterValkeyClient`).                                                                                                                   | `1000`                   |
| `VALKEY_REQUEST_TIMEOUT_MS`            | Request timeout for the `valkyries` app clients.                                                                                                                                                                   | `500`                    |
| `VALKEY_BLOOM_URL`                     | Dedicated Valkey URL for bloom operations. Defaults to `VALKEY_CACHE_URL` when unset.                                                                                                                              | (none)                   |
| `VALKEY_BLOOM_INFLIGHT_REQUESTS_LIMIT` | Optional inflight budget override for `bloomValkeyClient`. Client isolation is forced by `name: 'bloom'`; this tuner is only needed to cap bloom rebuild concurrency.                                              | `1000` (library default) |
| `VALKEY_INFLIGHT_RETRY_ATTEMPTS`       | Retry attempts on inflight-saturation errors. Governs the glide-mq command client (`glide-mq-retry.mts`) **and** valkyries' internal `ValkeyCache`-read and `RateLimiter` retry (since valkyries 0.4.0).           | `3`                      |
| `VALKEY_INFLIGHT_RETRY_DELAY_MS`       | Base delay (ms) for valkyries' internal `ValkeyCache` and `RateLimiter` saturation retry. Actual delay is jittered `[delayMs, delayMs×5]`. Does not affect `glide-mq-retry.mts` (which uses its own jitter range). | `1000`                   |

**6. Suppress stale-refresh read amplification**

`ValkeyCache.get` on a stale-but-present key spawns a background refresh (+1
inflight command). For worker contexts, disable background refresh or route it
through a low-priority connection.

**7. Split `workers-io` into smaller process groups (long-term)**

Rather than 30 IO queues in one process, group them by Valkey pressure (e.g.
5–10 queues per process). Each process gets its own shared Valkey connections
with independent 1000-inflight budgets.

**8. Autoscaling (long-term)**

Wire queue depth or inflight saturation metrics to ECS `desired_count`.
Currently fixed `desired_count = 1` with no autoscaling policy
(`vouchington-infra/opentofu/ecs-worker.tf`). Implement CloudWatch target-tracking policy
on queue depth or saturation.
