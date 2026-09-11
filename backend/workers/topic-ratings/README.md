# Topic Ratings Worker

Worker package for topic rating-stat refresh jobs.

Refreshes are serialized per topic in PostgreSQL and calculate, compare, and write from the same
primary transaction. Concurrent queue and publication-reconciliation refreshes therefore cannot
overwrite a newer aggregate with an older snapshot.

## Exports

- `topicRatings` - worker instance for the `topic-ratings` queue.

## Related

- Queue surface: [../../queues/topic-ratings/README.md](../../queues/topic-ratings/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
