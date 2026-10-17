# Valkey Data Store

Voucha's Valkey layer is a thin facade over [`valkyries`](https://github.com/jonathanong/valkyries),
split into per-concern pnpm packages (`valkey-core`, `valkey-pubsub`, `valkey-rate-limiter`,
`valkey-glide-mq`, and `valkey` for cache, Bloom, dynamic config, and the rest) so the workspace
graph enforces which concern each consumer may touch. Every package depends only on `valkey-core`
(star layering, cycle-free); consumers of pubsub, rate limiting, or queues must declare the matching
package. `valkyries` owns the reusable primitives; Voucha keeps application glue: session state,
the GlideMQ factory and registry, cache metric forwarding to analytics, and error handling through
`@modules/on-error`. Read primitive API details in the upstream `valkyries` docs.

## Client groups

Each group has its own URL so it can have its own eviction and persistence policy; in dev they all
point at one instance. Clients with the same URL are deduplicated unless given a distinct `name`.

- Session, cache, Bloom, and rate-limiter data are disposable (no persistence). Dynamic Config and
  the worker queue are `noeviction` with append-only persistence, because losing them loses
  configuration or jobs.
- Use `primary` reads when staleness is unacceptable: auth/session checks, rate limiting, and Bloom
  ready-marker and live-filter reads. Cache reads prefer a replica.
- `bloomValkeyClient` is isolated even when it shares the cache URL, so large Bloom rebuild batches
  cannot exhaust the cache client's inflight budget.
- The dynamic-config group also holds the fail-closed AI accounting uncertainty latch. Ops may
  `UNLINK` a day key to recover after an outage; never flush the group.

## Worker queue

GlideMQ needs Valkey/Redis server functions (`FUNCTION LOAD` / `FCALL`). AWS ElastiCache
Serverless blocks them and is incompatible. Build queues and workers only through the factory in
`@data-stores/valkey-glide-mq`, never `new Worker(...)` (enforced by an ast-grep rule), and keep
`glide-mq` specs aligned across workspaces. See
[Worker construction](../../overview/architecture/backend/README.md).

**Enqueue retry.** Only client-side `Reached maximum inflight requests` is retried, because Glide
rejects it before the command reaches Valkey. Other transient errors (connection close, request
timeout) are ambiguous for non-idempotent queues, since the server may already have accepted the
enqueue and a retry would duplicate jobs. `ValkeyCache` reads and `RateLimiter` commands retry
saturation internally in a separate layer.

## Shutdown order

`valkey-core/shutdown.mts` self-registers on import, so any process touching a Valkey concern gets
it: close `DynamicConfig` wrappers first so subscriptions stop, drain GlideMQ queues, workers, and
flow producers while `valkyries` closes shared clients, then close the shared GlideMQ command
client. That client is lazy on purpose: importing the queue facade must not open a connection, and
shutdown must not close it before workers and producers finish draining. Dedicated pub/sub clients
and `dedicatedCommandClient` workers are closed by their owners.

## Related checklists

- [Rate Limiter Checklist](reference-rate-limiter-checklist.md)
- [Pub/Sub Lifecycle](reference-pub-sub-lifecycle.md)
