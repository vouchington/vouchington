# @services/platform-stats

Retrieves aggregate platform-wide statistics for display on public stats pages.

## Key exports

- `getPlatformStats(): Promise<PlatformStats>` — returns counts for topics, RSS feeds, posts, reviews, data points, and hostnames
- `PlatformStats` — `{ topic_count, rss_feed_count, post_count, review_count, data_point_count, hostname_count }`

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- [backend/api/v1/platform-stats/README.md](../../api/v1/platform-stats/README.md)
