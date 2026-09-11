# GET /api/v1/rss-feeds/recommended

[Back to RSS Feeds API](README.md#get-apiv1rss-feedsrecommended)

List recommended RSS feeds personalized for the current user.

**Unauthorized.**

Recommendations are weighted from three sources:

1. **Friends** (weight: 3.0) — feeds followed by users the current user follows
2. **Topic** (weight: 2.5) — feeds linked to topics the user follows
3. **Collaborative** (weight: 2.0) — feeds followed by users who share feed follow overlap with the current user

Excludes feeds the user already follows or has muted.

Query parameters:

- `limit` — max results (1-100, default: 20)
- `after` — cursor for pagination
- `source` — filter by source: `friends`, `topic`, `collaborative`, or `all` (optional; default: all sources combined)

Response:

```json
{
  "results": [
    { "id": "...", "recommendation_score": 7.5, "recommendation_reasons": ["friends", "topic"] }
  ],
  "page_info": { "has_next_page": false, "end_cursor": "..." },
  "rss_feeds": { "...": { "title": "...", "rss_feed_url": { "id": "...", "url": "..." }, ... } }
}
```
