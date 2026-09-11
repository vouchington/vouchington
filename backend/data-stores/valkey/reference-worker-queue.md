# Worker Queue

[Back to Valkey Data Store](README.md#worker-queue)

The Worker Queue client group uses `glide-mq`, which relies on Valkey server functions (`FUNCTION LOAD` / `FCALL`) for queue operations.

- Minimum supported server: Valkey 7.0+ or Redis 7.0+
- AWS ElastiCache Serverless is not compatible with the Worker Queue because it blocks `FUNCTION *` and `FCALL`
- Queue producers should use `createQueue()`, `createEnqueueFunction()`, and `createBulkEnqueueFunction()` from [`@data-stores/valkey-glide-mq`](../valkey-glide-mq/glide-mq-factory.mts)
- Keep `glide-mq` package specs aligned across backend workspaces

Infrastructure details live in [../../../docs/overview/infrastructure/infrastructure.md](../../../docs/overview/infrastructure/infrastructure.md).
