# Vote Weight Worker

Source entrypoint: [backend/workers/vote-aggregation/README.md](../../../../../../backend/workers/vote-aggregation/README.md)

The shared `background` worker runs user vote-weight recalculation, dispatcher, and election fan-out jobs as the `vote-aggregation` domain.

## Exports

- `voteAggregationHandlers` - the domain's handlers, registered in the shared background worker.

## Related

- Queue surface: [../../queues/vote-weight/README.md](../../vote-weight/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
