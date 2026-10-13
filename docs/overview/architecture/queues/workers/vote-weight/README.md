# Vote Weight Worker

Source entrypoint: [backend/workers/vote-aggregation/README.md](../../../../../../backend/workers/vote-aggregation/README.md)

Shared `vote-aggregation` worker handles user vote-weight recalculation and dispatcher jobs.

## Exports

- `voteAggregation` - shared worker instance for the `vote-aggregation` queue.

## Related

- Queue surface: [../../queues/vote-weight/README.md](../../vote-weight/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
