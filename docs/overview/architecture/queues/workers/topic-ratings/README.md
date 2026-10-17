# Topic Ratings Worker

Source entrypoint: [backend/workers/vote-aggregation/README.md](../../../../../../backend/workers/vote-aggregation/README.md)

The shared `background` worker handles topic rating-stat refresh jobs as the `vote-aggregation` domain.

Refreshes are serialized per topic in PostgreSQL and calculate, compare, and write from the same
primary transaction. Concurrent queue and publication-reconciliation refreshes therefore cannot
overwrite a newer aggregate with an older snapshot.

## Exports

- `voteAggregationHandlers` - the domain's handlers, registered in the shared background worker.

## Related

- Queue surface: [../../queues/topic-ratings/README.md](../../topic-ratings/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
