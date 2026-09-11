# Valkey GlideMQ Data Store

Queue producer/worker facade over `glide-mq`, built on the shared connection primitive in
[`@data-stores/valkey-core`](../valkey-core). Consumers that enqueue or process jobs (queues,
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

## Related

- Worker Queue client group, shutdown sequencing, and enqueue retry semantics:
  [../valkey/README.md](../valkey/README.md)
- Backend context: [../../CLAUDE.md](../../CLAUDE.md)
