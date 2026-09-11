# Trending RSS Feeds Service

Ranks RSS feeds by recent activity and popularity, powering discovery on the home page.

## Scoring

Trending score combines two recent signals over a configurable time window:

- **Recent follows** (weight: 3.0) — number of new follows on the feed
- **Recent items** (weight: 1.0) — number of new feed items published

Formula: `follow_count * 3.0 + item_count * 1.0`

Time ranges:

- `day` — last 24 hours
- `week` — last 7 days (default)
- `month` — last 30 days

## Data Dependencies

The service queries:

- `rss_feeds` — feed metadata (title, feed_url, topic_id)
- `relation__user__follow__rss_feed` — follow counts by feed
- `rss_feed_items` — items and creation timestamps

## Integration

Called by `GET /api/v1/rss-feeds/trending` endpoint.

- Cached (short TTL) for unauthenticated users
- Not personalized; same results for all users
- Cursor-paginated using score cursor (`{ score, id }`)

## Related

- API: [../../api/v1/rss-feeds/README.md](../../api/v1/rss-feeds/README.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
