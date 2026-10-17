# Robots.txt

Source entrypoint: [backend/services/urls-domains-robots/README.md](../../../../../backend/services/urls-domains-robots/README.md)

## Acceptance

This is a simple function to fetch `robots.txt` for domains.
Results are cached in Valkey.

- If a hostname is blocked or crawling is disabled, disallow crawling
- If robots.txt is missing, empty, oversized, or returns HTTP 4xx, the rules file is unavailable and crawling is allowed
- If robots.txt stays unreachable after the existing retries (HTTP 5xx or a network error), crawling is disallowed for 15 minutes unless a robots.txt body is still inside its 24-hour cache

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
- robots.txt fetches validate each URL, pin the connection to those addresses, and follow at most five redirects. Each redirect is validated and pinned again. Targets that fail SSRF validation, including redirects that are not `http` or `https`, are DISALLOW and are not requested. DNS timeouts and other network errors still retry and then DISALLOW. The original `https://{domain}/robots.txt` URL stays the parser origin. The chain budget covers DNS, redirects, and the final body read. HTTP 4xx, 5xx, and other statuses that are not parsed cancel that body before they allow, retry, disallow, or throw, so an unread error body does not hold the pinned connection until the dispatcher body timeout. The budgets are recorded in [runtime timeout classification](../../../../development/reference-runtime-timeouts-classification.md#hard-constraints-externalprotocol-driven).
- A reachable robots.txt decision, including HTTP 4xx allow-all and blacklist or SSRF disallow, stays in the 24-hour Valkey cache. An unreachable decision uses a separate 15-minute marker and does not replace a robots.txt body that is still inside that 24-hour cache. HTTP 429 on robots.txt stays allow-all: RFC 9309 treats it as an unavailable rules file.

## Related

- [Crawling Overview](../../crawling.md)
- [Crawls Service](../crawls/README.md)
- [URLs Hostnames Service](../urls-hostnames/README.md)
