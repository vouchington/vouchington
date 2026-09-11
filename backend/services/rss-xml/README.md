# @services/rss-xml

Generates RSS/Atom XML feed documents for posts and news, with XML building utilities and rate limiting.

## Key exports

- `buildPostsRssFeed(options: PostsFeedOptions)` — generates an RSS XML document for a post list
- `buildNewsFeed(options: NewsFeedOptions)` — generates an RSS XML document for a news feed
- `buildRssXml(channel: RssChannel, items: RssItem[])` — low-level XML builder for constructing feed documents
- `checkRssRateLimit(primaryId, ip)` — enforces per-identity rate limiting on RSS feed requests

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- RSS feeds service: [../rss-feeds/README.md](../rss-feeds/README.md)
