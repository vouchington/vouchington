# Valkey GlideMQ Data Store

Source entrypoint: [backend/data-stores/valkey-glide-mq/README.md](../../../../../../backend/data-stores/valkey-glide-mq/README.md)

Queue producer/worker facade over `glide-mq`, built on the shared connection primitive in
[`@data-stores/valkey-core`](../../../../../../backend/data-stores/valkey-core). Consumers that enqueue or process jobs (queues,
workers, flows) declare this package instead of reaching into the `@data-stores/valkey` barrel.

## Exports

- `createQueue`, `createWorker`, `createFlowProducer` - from `glide-mq-factory.mts`.
- `createEnqueueFunction`, `createBulkEnqueueFunction` - enqueue helpers that track job counts and
  report rejected promises to `onError`.
- `workerQueueCommandClient` - shared command client from `glide-mq-shared-client.mts`, lazily
  realized on first use and drained through the core registry on shutdown.
- `registerWorkerQueueScript` - creates a Lua script in `@glidemq/speedkey`'s native registry so
  `workerQueueCommandClient.invokeScript()` can automatically load and retry it.
- `workerQueueConnection`, `buildWorkerQueueSettings`, `workerQueuePrefix` - re-exported from
  `@data-stores/valkey-core/glide-mq-client`.

Queue-stat read, aggregate, and bounded oldest-waiting-age functions are exported by `get-queue-stats.mts`. Their cache and Lua reads live here so queue producers can inspect backpressure without depending on the higher-level queue-monitoring service. Staff inventories, queue controls, scheduled jobs, and backfills remain in that service.

## Related

- Worker Queue client group, shutdown sequencing, and enqueue retry semantics:
  [../valkey/README.md](../../../../../development/valkey/README.md)
- Backend context: [../../AGENTS.md](../../../../../../backend/AGENTS.md)
