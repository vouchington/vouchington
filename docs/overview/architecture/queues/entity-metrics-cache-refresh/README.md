# Entity Metrics Cache Refresh System

Source entrypoint: [backend/queues/entity-metrics-cache-refresh/README.md](../../../../../backend/queues/entity-metrics-cache-refresh/README.md)

Refreshes cached metrics for topics, posts, and users using debounce deduplication to coalesce rapid updates.

## Queue Configuration

### `entity-metrics-cache-refresh` (concurrency: 10)

- `processRefreshTopicMetrics` — recalculates and caches metrics for a topic (follower count, post count, etc.)
- `processRefreshPostMetrics` — recalculates and caches metrics for a post (vote score, comment count, etc.)
- `processRefreshUserMetrics` — recalculates and caches metrics for a user (follower count, post count, etc.)

Current producers enqueue affected entity IDs after vote, bookmark, and publication changes. The
queue debounces repeated refreshes for the same entity; processors derive metrics from durable
PostgreSQL state rather than carrying historical scores in job payloads.

## Related

- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
- Entity cache service: [../../services/entity-cache/README.md](../../services/entity-cache/README.md)
