# @services/platform-stats

Source entrypoint: [backend/services/platform-stats/README.md](../../../../../backend/services/platform-stats/README.md)

Retrieves aggregate platform-wide statistics for display on public stats pages.

## Key exports

- `getPlatformStats(): Promise<PlatformStats>` — returns counts for topics, RSS feeds, posts, reviews, data points, and hostnames
- `PlatformStats` — `{ topic_count, rss_feed_count, post_count, review_count, data_point_count, hostname_count }`

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- [docs/requirements/api/v1/platform-stats/README.md](../../../../requirements/api/v1/platform-stats/README.md)
