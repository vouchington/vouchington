Review Valkey scripts and usage. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Load `vouchington-valkey`.

- Collapse sequential awaits and per-item calls into `MGET`, a [`Batch`](https://valkey.io/valkey-glide/node/Batch/classes/Batch/), or Lua (for 2+ commands that must be atomic or share a round trip; never `Batch` a single command). `SCAN` cursors and bounded deletion loops are intentional exceptions; avoid unbounded concurrent fan-out. Memoize repeated lookups within a request.
- Look for calls that belong in Lua, Lua scripts that can be optimized, races, missing expirations, excessive key scans, and weak key naming.
- `createChannelPubSub` users: SSE routes call `subscription.close()` on disconnect/finally, tests close subscribers in `afterAll`, and pub/sub clients are separate from shared singletons. Fire-and-forget `publish*` and `queue.signal()` calls need `.catch(onError)` or a justified benign catch.
- Inflight saturation: confirm `valkey_inflight_saturation` (from `retryOnInflightSaturation` in `glide-mq-retry.mts`) is alerted in Sentry, and check whether a shared command client (for example `workerQueueCommandClient`) serves too many high-concurrency queues. Prefer per-workload client isolation (the `bloomValkeyClient` pattern in `clients.mts`) over raising `inflightRequestsLimit`.
- Replica routing: auth, rate limits, Bloom ready-marker/live-filter reads, and SNS-replay reads stay `primary`; caches use `preferReplica`.
- Pick one worker job and count its Valkey calls from the code; flag batchable ones.
- Changes to a cache miss, fallback, durable recovery, or atomic tracked-range update need coverage through the real `cacheValkeyClient` boundary, warm and cold (including `getTrackedDayRange()` and `markTrackedDay()`), mocking only the S3 boundary per `storage.no-data.mock.test.mts`.
