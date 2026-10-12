# Vote Integrity Worker

Source entrypoint: [backend/workers/vote-aggregation/README.md](../../../../../../backend/workers/vote-aggregation/README.md)

Shared `vote-aggregation` worker handles vote integrity check jobs.

## Exports

- `voteAggregation` - shared worker instance for the `vote-aggregation` queue.

## Related

- Queue surface: [../../queues/vote-integrity/README.md](../../vote-integrity/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
