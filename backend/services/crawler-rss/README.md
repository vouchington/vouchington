# @services/crawler-rss

Filaments policy adapter around `@vouchington/rss-crawler` and `@vouchington/rss-parser`, with
conditional GET, content hashing, and metrics tracking.

## Key exports

- `default CrawlerRss(url: string, options?: CrawlerRssOptions): Promise<CrawlerRssResult>` — fetches and parses a feed URL; on 304 returns `{ responseCode: 304, feed: null, ... }`
- `CrawlerRssOptions` — `{ headers?, timeoutMs? (default 10s), maxResponseSizeBytes? (default 10MB) }`
- `CrawlerRssResult` — `{ responseCode, feed, contentSha256, headers: { etag, lastModified } }`
- `ParsedFeed` — raw parsed feed data (format-specific shape)

The upstream packages own generic response-state handling, content-type admission, byte decoding,
parsing, and raw-byte hashing. This adapter retains the Voucha user agent and compression headers,
SSRF-pinned transport, timeout and response-size policy, typed crawler errors, raw redirect locations,
and crawler analytics.

Malformed feed bodies emit failed RSS crawler analytics with `error_type='ParseFeedError'`; valid parsed feeds emit success only after parsing completes.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Crawler utils: [../crawler-utils/README.md](../crawler-utils/README.md)
- RSS feeds system: [../../queues/rss-feeds/README.md](../../queues/rss-feeds/README.md)
