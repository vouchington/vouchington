# Entity Metrics Cache Refresh Worker

Source entrypoint: [backend/workers/vote-aggregation/README.md](../../../../../../backend/workers/vote-aggregation/README.md)

The shared `background` worker refreshes cached topic, post, and user metrics as the `vote-aggregation` domain.

## Exports

- `voteAggregationHandlers` - the domain's handlers, registered in the shared background worker.

## Related

- Queue surface: [../../queues/entity-metrics-cache-refresh/README.md](../../entity-metrics-cache-refresh/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
