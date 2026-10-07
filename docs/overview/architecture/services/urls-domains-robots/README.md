# Robots.txt

Source entrypoint: [backend/services/urls-domains-robots/README.md](../../../../../backend/services/urls-domains-robots/README.md)

## Acceptance

This is a simple function to fetch `robots.txt` for domains.
Results are cached in Valkey.

- If a hostname is blocked or crawling is disabled, disallow from crawling
- If there is no robots.txt or we fail to fetch for some reason, we assume we can crawl.

## Exported Functions

- `isUrlCrawlable(url, userAgent)` — checks if a full URL is allowed by robots.txt; returns `false` when the parser cannot compare the URL against the fetched robots.txt origin
- `computeHostnameRateLimitMs(hostname, requestsPerSecondLimit, userAgent)` — returns the effective inter-request delay (ms), taking the max of the hostname's requests_per_second_limit and robots.txt Crawl-delay
- `fetchRobotsTxtCached(domain)` — fetches and caches robots.txt content

All exported functions share an internal `getParsedRobots(domain)` helper to avoid duplicate fetches and parsing.

See [docs/overview/architecture/crawling.md](../../crawling.md) for runtime behavior: bloom filter fast path, RFC 9309 compliance, and error handling.

## Notes

- `@vouchington/robots` owns generic robots.txt parsing; blacklist, fetch, retry, status fallback, Valkey caching, and rate-limit policy remain in this service
- `Crawl-delay` values from robots.txt are in seconds; `getCrawlDelayMs` converts to milliseconds via `Math.ceil(delay * 1000)`
- Allow, disallow, and crawl-delay groups match the User-Agent product token: the first token, without a `/version` suffix. `voucha-bot https://voucha.ai/article/voucha-bot` matches `User-agent: voucha-bot`. The HTTP header stays the full crawler string. A matching specific group does not inherit the `*` group's crawl delay.
- robots.txt fetches use the shared backend external-request dispatcher so repeated hostname checks reuse sockets instead of opening a fresh connection per request

## Related

- [Crawling Overview](../../crawling.md)
- [Crawls Service](../crawls/README.md)
- [URLs Hostnames Service](../urls-hostnames/README.md)
