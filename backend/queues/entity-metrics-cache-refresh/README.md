# Entity Metrics Cache Refresh System

Refreshes cached metrics for topics, posts, and users using debounce deduplication to coalesce rapid updates.

## Queue Configuration

### `entity-metrics-cache-refresh` (concurrency: 10)

- `processRefreshTopicMetrics` — recalculates and caches metrics for a topic (follower count, post count, etc.)
- `processRefreshPostMetrics` — recalculates and caches metrics for a post (vote score, comment count, etc.)
- `processRefreshUserMetrics` — recalculates and caches metrics for a user (follower count, post count, etc.)

The semantic-vote data migration enqueues affected topic metric refreshes and the paired topic
election invalidation only after its database transaction commits. The migration task awaits every
bounded queue batch and writes its durable completion claim only after all enqueue calls succeed;
a failed task retries without dropping partial batches because both queues use topic-scoped
deduplication.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Entity cache service: [../../services/entity-cache/README.md](../../services/entity-cache/README.md)
