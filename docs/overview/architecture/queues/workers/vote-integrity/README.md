# Vote Integrity Worker

Source entrypoint: [backend/workers/vote-aggregation/README.md](../../../../../../backend/workers/vote-aggregation/README.md)

The shared `background` worker handles vote integrity check jobs as the `vote-aggregation` domain.

## Exports

- `voteAggregationHandlers` - the domain's handlers, registered in the shared background worker.

## Related

- Queue surface: [../../queues/vote-integrity/README.md](../../vote-integrity/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
