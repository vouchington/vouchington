# POST /api/v1/rss-feeds

[Back to RSS Feeds API](README.md#post-apiv1rss-feeds)

Submit an RSS feed URL as a source. Any authenticated user can call this.

- If the URL is new: creates a topic (`topic_type='rss_feed'`) + RSS feed, upvotes the topic, follows the feed, and triggers an immediate crawl. Returns **201**.
- If the URL already exists: upvotes the existing topic and follows the feed. Returns **200**.

Request body:

```json
{ "rss_feed_url": "https://example.com/feed.xml" }
```

Response:

```json
{
  "status": "created" | "upvoted",
  "rss_feed_id": "...",
  "topic_id": "...",
  "topic_slug": "..."
}
```

The `topic_slug` can be used to redirect to `/source/{topic_slug}` after submission.
