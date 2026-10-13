# Topic Ratings Worker

Source entrypoint: [backend/workers/vote-aggregation/README.md](../../../../../../backend/workers/vote-aggregation/README.md)

Shared `vote-aggregation` worker handles topic rating-stat refresh jobs.

Refreshes are serialized per topic in PostgreSQL and calculate, compare, and write from the same
primary transaction. Concurrent queue and publication-reconciliation refreshes therefore cannot
overwrite a newer aggregate with an older snapshot.

## Exports

- `voteAggregation` - shared worker instance for the `vote-aggregation` queue.

## Related

- Queue surface: [../../queues/topic-ratings/README.md](../../topic-ratings/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
