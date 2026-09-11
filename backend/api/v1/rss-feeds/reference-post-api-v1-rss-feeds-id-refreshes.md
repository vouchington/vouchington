# POST /api/v1/rss-feeds/:id/refreshes

[Back to RSS Feeds API](README.md#post-apiv1rss-feedsidrefreshes)

Enqueues an RSS feed fetch job. The API does not fetch the remote feed synchronously.

Query parameter or request body:

- `force` — boolean, bypass cache and force re-fetch

Response:

```json
{
  "success": true,
  "message": "RSS feed refresh enqueued",
  "rss_feed_id": "...",
  "force": false
}
```
