# POST /api/v1/rss-feeds

[Back to RSS Feeds API](../../../../../backend/api/v1/rss-feeds/README.md#post-apiv1rss-feeds)

Submit an RSS feed URL as a source. Any authenticated user can call this.

- If the URL is new: creates a topic (`topic_type='rss_feed'`) + RSS feed, upvotes the topic, follows the feed, and triggers an immediate crawl. Returns **201**.
- If the URL already exists: upvotes the existing topic and follows the feed. Returns **200**.
- The upvote is the caller's automatic +1 vote. An official, system or AI agent account (any non-null `account_type`) gets the same responses, the created feed and the follow, but no vote is written: these accounts cannot create community trust signals. `status: 'upvoted'` means the feed already existed, not that a vote was recorded. The [My import](../my/reference-post-api-v1-my-import-rss-feeds.md) route follows the same rule.

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
