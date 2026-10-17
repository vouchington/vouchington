# @services/platform-stats

Source entrypoint: [backend/services/platform-stats/README.md](../../../../../backend/services/platform-stats/README.md)

Retrieves aggregate platform-wide statistics for display on public stats pages.

`getPlatformStats` reads the single `mv_platform_stats` row. The PostgreSQL scheduler refreshes
it every five minutes; the public Valkey and HTTP caches can extend the visible lag by their
short TTLs. Cold requests therefore read one precomputed row instead of counting all posts,
feeds, topics and hostnames.

## Key exports

- `getPlatformStats(): Promise<PlatformStats>` — returns counts for topics, RSS feeds, posts, reviews, data points, and hostnames
- `PlatformStats` — `{ topic_count, rss_feed_count, post_count, review_count, data_point_count, hostname_count }`

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
