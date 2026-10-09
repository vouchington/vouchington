# Valkey GlideMQ Data Store

Source entrypoint: [backend/data-stores/valkey-glide-mq/README.md](../../../../../../backend/data-stores/valkey-glide-mq/README.md)

Queue producer/worker facade over `glide-mq`, built on the shared connection primitive in
[`@data-stores/valkey-core`](../../../../../../backend/data-stores/valkey-core). Consumers that enqueue or process jobs (queues,
workers, flows) declare this package instead of reaching into the `@data-stores/valkey` barrel.

## Exports

- `createQueue`, `createWorker`, `createBatchWorker`, `createFlowProducer` - from
  `glide-mq-factory.mts`. Every backend GlideMQ worker is built here (see
  [Worker construction](#worker-construction)); the `backend-no-direct-glide-worker` AST-grep rule
  rejects a direct `new Worker(...)`.
- `createEnqueueFunction`, `createBulkEnqueueFunction` - enqueue helpers that track job counts and
  report rejected promises to `onError`.
- `workerQueueCommandClient` - shared command client from `glide-mq-shared-client.mts`, lazily
  realized on first use and drained through the core registry on shutdown. It and every dedicated
  worker client come from `createRetryingCommandClient` in `glide-mq-command-client.mts`, so they
  share one request timeout, inflight limit, and saturation-retry policy.
- `registerWorkerQueueScript` - creates a Lua script in `@glidemq/speedkey`'s native registry so
  `workerQueueCommandClient.invokeScript()` can automatically load and retry it.
- `workerQueueConnection`, `buildWorkerQueueSettings`, `workerQueuePrefix` - re-exported from
  `@data-stores/valkey-core/glide-mq-client`.

## Worker construction

`createWorker` (and `createBatchWorker` for `batch` processors) registers the worker with the core
registry so graceful shutdown closes it, then applies:

- **Command client.** By default a worker shares `workerQueueCommandClient`, as queues and flow
  producers do. Pass `dedicatedCommandClient: true` to give a worker its own lazily connected
  command connection, so its heartbeats and completions never queue behind another queue's promote,
  stalled-scan, or `addBulk` traffic on one multiplexed connection. The dedicated client uses the
  same `WORKER_QUEUE_REQUEST_TIMEOUT_MS`, `WORKER_QUEUE_INFLIGHT_REQUESTS_LIMIT`, and
  inflight-saturation retry as the shared one, and closes when the worker closes, even if
  `worker.close()` throws. glide-mq closes only a command client it created itself, so unlike an
  owned client, an injected one is not recreated on a reconnect; GLIDE reconnects the connection
  internally and the worker only pings it.
- **Stall budget.** `maxStalledCount` defaults to `2` (glide-mq's own default is `1`). A job's
  `stalledCount` never resets and ignores `attempts`, so stall number `maxStalledCount + 1` fails it
  permanently with `job stalled more than maxStalledCount`. One rolling deploy (graceful shutdown
  force-exits after `GRACEFUL_SHUTDOWN_PERIOD_SECONDS`, which can interrupt a long job) plus one
  slow heartbeat would otherwise exhaust a budget of `1`. A worker may still pass its own value.
- **Connection and prefix.** `connection` and the queue `prefix` come from the worker-queue settings.
  A test may pass `prefix` to isolate its queue.

The `backend-no-direct-glide-worker` AST-grep rule flags `new Worker(...)` whenever the constructor
resolves to GlideMQ's `Worker` through a named, aliased, namespace, or `await import()` binding, so
`node:worker_threads` workers and `new Worker.RateLimitError()` stay legal. The factory file and
test files (`*.test.mts`, `__tests__/**`, `backend/test-helpers/**`) are exempt: real-glide tests
build raw workers on isolated queue prefixes to exercise transport behavior. The rule cannot follow a
constructor passed through a parameter, so production code injects the factory instead of a
constructor. One production file is ignored temporarily: `bedrock-embeddings-batch-creation` keeps
its direct `new Worker(...)` until #2447, which edits that file's worker options, lands.

Queue-wide limits are queue state, not worker options: a worker that must run one job at a time
across replicas (for example `bedrock-embeddings-batch-creation` and `bluesky-follow-propagation`)
calls `queue.setGlobalConcurrency(1)` before creating its worker, because `concurrency` bounds one
process only.

Queue-stat read, aggregate, and bounded oldest-waiting-age functions are exported by `get-queue-stats.mts`. Their cache and Lua reads live here so queue producers can inspect backpressure without depending on the higher-level queue-monitoring service. Staff inventories, queue controls, scheduled jobs, and backfills remain in that service.

## Related

- Worker Queue client group, shutdown sequencing, and enqueue retry semantics:
  [../valkey/README.md](../../../../../development/valkey/README.md)
- Backend context: [../../AGENTS.md](../../../../../../backend/AGENTS.md)
