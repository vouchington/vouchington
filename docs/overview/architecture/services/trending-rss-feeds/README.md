# Trending RSS Feeds Service

Source entrypoint: [backend/services/trending-rss-feeds/README.md](../../../../../backend/services/trending-rss-feeds/README.md)

Ranks RSS feeds by recent activity and popularity, powering discovery on the home page.

The three fixed windows are scored in `mv_trending_rss_feeds` every five minutes, using a
rolling cutoff at refresh time. A feed's score and visibility may trail a write by one refresh
cycle, plus the short anonymous Valkey cache TTL. Requests seek the materialized ranking index
and return only the requested page.

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

- `rss_feeds` — enabled and discoverable feed status at refresh
- `relation__user__follow__rss_feed` — recent follows at refresh
- `rss_feed_items` and `rss_feed_item_sources` — recent published items at refresh

## Integration

Called by `GET /api/v1/rss-feeds/trending` endpoint.

- Cached (short TTL) for unauthenticated users
- Not personalized; same results for all users
- Cursor-paginated using score cursor (`{ score, id }`)

## Related

- API: [../../api/v1/rss-feeds/README.md](../../../../../backend/api/v1/rss-feeds/README.md)
- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
