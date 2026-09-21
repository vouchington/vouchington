# Valkey Data Store

Voucha's Valkey layer is a thin facade over [`valkyries`](https://github.com/jonathanong/valkyries), split into per-concern pnpm packages so the workspace graph enforces which concern each consumer may touch:

| Package                            | Directory                | Holds                                                                                                                                                                   |
| ---------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@data-stores/valkey-core`         | `../valkey-core`         | Shared leaf: `config`, `app-integration` (error handler + analytics bridge), `glide-mq-client` (connection primitive), `glide-mq-registry`, `shutdown`                  |
| `@data-stores/valkey-pubsub`       | `../valkey-pubsub`       | `createChannelPubSub` plus the chat-token / image-state / data-request / article-sync / import-progress facades                                                         |
| `@data-stores/valkey-rate-limiter` | `../valkey-rate-limiter` | `RateLimiter` facade                                                                                                                                                    |
| `@data-stores/valkey-glide-mq`     | `../valkey-glide-mq`     | `glide-mq-factory` (createQueue/createWorker/createFlowProducer/enqueue helpers), shared command client, enqueue retry                                                  |
| `@data-stores/valkey` (this)       | here                     | Service-only concerns: cache, cache metrics, Bloom filters, conditional operations, dynamic config, idempotency keys, JWT staleness, clients, scripts, utils, and types |

Every package depends only on `valkey-core` (star layering, cycle-free). The `@data-stores/valkey` barrel has no path to the three extracted concerns: consumers of pubsub, rate limiting, or queues must declare the matching per-concern package in their `package.json`.

`valkyries` owns the reusable primitives:

- `ValkeyCache`
- `ValkeyBloomFilter`
- `DynamicConfig`
- `RateLimiter`
- shared Valkey clients, script helpers, events, cache invalidation, conditional unlink, idempotency-key reservation, shutdown helpers, and cursor-based TTL hygiene sweeps

Voucha keeps application-specific glue across these packages:

- `sessionValkeyClient` for auth/session state on `VALKEY_SESSION_URL`
- GlideMQ queue connection/factory/registry on `VALKEY_WORKER_QUEUE_URL`
- cache metric forwarding from `valkyries` `cache:call` events into `@data-stores/analytics`
- package error handling routed through `@modules/on-error`

Imports such as `@data-stores/valkey/cache`, `@data-stores/valkey/conditional`,
`@data-stores/valkey/idempotency-key`, and `@data-stores/valkey/clients` remain supported through
selective facade modules in this package. The idempotency facade exposes both token-fenced
reservations and atomic consume-once reads through `getAndDelete()`.

## Contents

- <a id="client-groups"></a>[Client Groups](reference-client-groups.md)
- <a id="bloom-client"></a>[Bloom Client](reference-bloom-client.md)
- <a id="lua-scripts"></a>[Lua Scripts](reference-lua-scripts.md)
- <a id="rate-limiter-checklist"></a>[Rate Limiter Checklist](reference-rate-limiter-checklist.md)
- <a id="worker-queue"></a>[Worker Queue](reference-worker-queue.md)
- <a id="pubsub-lifecycle"></a>[Pub/Sub Lifecycle](reference-pub-sub-lifecycle.md)
- <a id="shutdown-sequencing"></a>[Shutdown Sequencing](reference-shutdown-sequencing.md)
- <a id="queue-enqueue-retry"></a>[Queue Enqueue Retry](reference-queue-enqueue-retry.md)
- <a id="primitives"></a>[Primitives](reference-primitives.md)
- <a id="related"></a>[Related](reference-related.md)
