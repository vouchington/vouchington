# Authorization

[Back to RSS Feeds API](README.md#authorization)

- `GET /rss-feeds`, `GET /rss-feeds/:id`, `GET /rss-feeds/trending`: public, cached for anon
- `GET /rss-feeds/recommended`: authentication required, not cached
- `POST /rss-feeds`: any authenticated user (`currentUserCanCreateRssFeed`)
- PATCH/DELETE: admin only
- Crawls/Refresh: admin only (`currentUserCanRefreshRssFeed`)
