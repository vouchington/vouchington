# Worker Queue

[Back to Valkey Data Store](README.md#worker-queue)

The Worker Queue client group uses `glide-mq`, which relies on Valkey server functions (`FUNCTION LOAD` / `FCALL`) for queue operations.

- Minimum supported server: Valkey 7.0+ or Redis 7.0+
- AWS ElastiCache Serverless is not compatible with the Worker Queue because it blocks `FUNCTION *` and `FCALL`
- Queue producers should use `createQueue()`, `createEnqueueFunction()`, and `createBulkEnqueueFunction()` from [`@data-stores/valkey-glide-mq`](../../../backend/data-stores/valkey-glide-mq/glide-mq-factory.mts)
- Workers use `createWorker()` or `createBatchWorker()` from the same package, never `new Worker(...)` (the `backend-no-direct-glide-worker` AST-grep rule enforces this). `dedicatedCommandClient: true` gives a worker its own command connection instead of the shared one; both honor `WORKER_QUEUE_REQUEST_TIMEOUT_MS` and retry inflight-saturation errors. `maxStalledCount` defaults to `2`. See [Worker construction](../../overview/architecture/backend/data-stores/valkey-glide-mq/README.md#worker-construction)
- Keep `glide-mq` package specs aligned across backend workspaces

Infrastructure details live in [../../../docs/overview/infrastructure/infrastructure.md](../../overview/infrastructure/infrastructure.md).
