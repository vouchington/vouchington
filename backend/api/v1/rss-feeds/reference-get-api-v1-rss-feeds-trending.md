# GET /api/v1/rss-feeds/trending

[Back to RSS Feeds API](README.md#get-apiv1rss-feedstrending)

List trending RSS feeds ranked by recent activity (follows, items).

Query parameters:

- `limit` — max results (1-100, default: 20)
- `after` — cursor for pagination
- `time_range` — time window for scoring: `day` (24h), `week` (7d), or `month` (30d); default: `week` (7 days)
- `min_score` — minimum trend score to include (optional)

Cached (short TTL) for unauthenticated users.

Response:

```json
{
  "results": [
    { "id": "...", "trending_score": 42.5, "follow_count": 10, "item_count": 35 }
  ],
  "page_info": { "has_next_page": false, "end_cursor": "..." },
  "rss_feeds": { "...": { "title": "...", "rss_feed_url": { "id": "...", "url": "..." }, ... } }
}
```
