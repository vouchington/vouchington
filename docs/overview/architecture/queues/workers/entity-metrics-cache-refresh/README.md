# Entity Metrics Cache Refresh Worker

Source entrypoint: [backend/workers/vote-aggregation/README.md](../../../../../../backend/workers/vote-aggregation/README.md)

Shared `vote-aggregation` worker handles refreshing cached topic, post, and user metrics.

## Exports

- `voteAggregation` - shared worker instance for the `vote-aggregation` queue.

## Related

- Queue surface: [../../queues/entity-metrics-cache-refresh/README.md](../../entity-metrics-cache-refresh/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
