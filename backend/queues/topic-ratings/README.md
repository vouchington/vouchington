# Topic Ratings System

Recalculates topic rating statistics with a 24-hour debounce per topic to avoid thrashing on high-traffic topics.

## Queue Configuration

### `topic-ratings` (concurrency: 10)

- `processUpdateTopicRatingStats` — recomputes average rating, rating count, and rating distribution for a topic from all active votes and reviews

Jobs use 24-hour debounce deduplication: if a recalculation job is already queued for a topic, the new enqueue resets the delay rather than creating a duplicate.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Topics service: [../../services/topics/README.md](../../services/topics/README.md)
- Elections system: [../elections/README.md](../elections/README.md)
