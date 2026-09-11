Review Valkey scripts and usage. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Minimize in-flight requests: collapse sequential awaits and per-item round-trips into a single batched call. Avoid per-item/key-by-key Valkey calls inside loops — collect the full key set first and use `MGET`/`Batch`. Cursor-based `SCAN` workflows and bounded deletion loops are intentional exceptions. Avoid unbounded concurrent fan-out that pressures the connection pool.
- Minimize total requests: combine reads with `MGET` or a [`Batch`](https://valkey.io/valkey-glide/node/Batch/classes/Batch/); cache or memoize repeated lookups within a single request lifecycle.
- Batch multi-command sequences: use `Batch` or Lua for any sequence of 2+ commands that should be atomic or travel in one round trip. Do not use `Batch` for a single command.
- For `createChannelPubSub` users, verify SSE routes close `subscription.close()` on disconnect/finally, tests close domain subscribers in `afterAll`, and request-accounting docs list dedicated pub/sub clients separately from shared singletons.
- Check intentional fire-and-forget `publish*` or `queue.signal()` calls for `.catch(onError)` or a clearly justified benign catch.
- Are there any calls that can be moved to Lua scripts?
- Can any of the Lua scripts be optimized?
- Are there race conditions, missing expirations, excessive key scans, or weak key naming patterns?
- Inflight-saturation health:
  - Confirm the `valkey_inflight_saturation` signal (recorded by `retryOnInflightSaturation` → `recordValkeySaturation` in `glide-mq-retry.mts`) is alerted in Sentry.
  - Check whether any single shared command client (e.g. `workerQueueCommandClient`, which backs every Queue/Worker/FlowProducer in a process) serves too many high-concurrency queues.
  - Prefer per-workload client isolation (the `bloomValkeyClient` pattern in `clients.mts`) over raising `inflightRequestsLimit`.
- Replica-routing correctness: verify each client's `readFrom` is still right — auth, rate limits, Bloom ready-marker/live-filter reads, and SNS-replay reads must stay `primary` (strongly consistent); caches use `preferReplica`.
- VALKEY_REQUESTS.md drift: spot-check one worker's `VALKEY_REQUESTS.md` per-job command count against its actual code and fix the doc if it drifted.
- When a change affects a cache miss, fallback, durable recovery, or atomic tracked-range update,
  add coverage through the real `cacheValkeyClient` service boundary. Exercise warm and cold cache
  paths, including `getTrackedDayRange()` and `markTrackedDay()`. Mock or spy only the S3 boundary,
  following `storage.no-data.mock.test.mts`; a direct Lua fallback-argument test is insufficient.
- Add or tighten tests for the selected behavior.
