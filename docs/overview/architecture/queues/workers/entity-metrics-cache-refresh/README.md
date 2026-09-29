# Entity Metrics Cache Refresh Worker

Source entrypoint: [backend/workers/entity-metrics-cache-refresh/README.md](../../../../../../backend/workers/entity-metrics-cache-refresh/README.md)

Worker package for refreshing cached topic, post, and user metrics.

## Exports

- `entityMetricsCacheRefresh` - worker instance for the `entity-metrics-cache-refresh` queue.

## Related

- Queue surface: [../../queues/entity-metrics-cache-refresh/README.md](../../entity-metrics-cache-refresh/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
