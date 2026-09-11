# @services/browser-crawl

Headless browser-based crawling of URLs that require JavaScript rendering, via Playwright
connected to Lightpanda's cloud CDP endpoint. No local browser binary — see
[`crawl.mts`](crawl.mts).

## Key exports

- `crawlWithBrowser(url: string): Promise<BrowserCrawlResult>` — connects to
  `LIGHTPANDA_CDP_URL` (+ `LIGHTPANDA_TOKEN`) via `chromium.connectOverCDP`, opens a
  `serviceWorkers: 'block'` browser context, navigates to `url` through a `page.route` handler
  (SSRF guard + ad-block filtering) and a `page.routeWebSocket` handler (SSRF guard on
  page-initiated WebSocket dials), and returns the rendered page content
- `BrowserCrawlResult` — `{ statusCode, hasContent, title, contentLength, html? }`

## Behavior

- SSRF guard (`ssrf.mts`, `assertSafeUrlSync`): synchronously blocks disallowed schemes,
  `localhost`/`.local` hostnames, and private IP literals on every subrequest, before the
  ad-blocker gets a turn, and on every page-initiated WebSocket dial (`ws:`/`wss:` schemes).
  DNS-rebinding protection for hostnames that only resolve to a private IP at request time is
  delegated to Lightpanda cloud's own private-network blocking — see
  [`docs/requirements/security/SECURITY.md`](../../../docs/requirements/security/SECURITY.md).
  `page.routeWebSocket()`, like `page.route()`, only sees dials from scripts running in the page or
  an iframe — a page-created Dedicated/Shared Web Worker that dials its own WebSocket bypasses this
  app-level guard, falling back to Lightpanda cloud's network-level blocking alone (Service Workers
  can't reach this path at all — they're blocked outright, see below).
- Service Workers are blocked at the context level (`newContext({ serviceWorkers: 'block' })`) so a
  crawled page can never register one and bypass `page.route()` — Playwright enforces this itself
  via a client-side init script, independent of whether Lightpanda implements Service Workers.
- Ad-blocking (`adblocker-cache.mts`): `@ghostery/adblocker-playwright` engine, loaded from a
  prebuilt list and cached to disk (`ADBLOCKER_CACHE_PATH`, default `$TMPDIR/adblocker-engine.bin`)
  so subsequent crawls skip the network fetch.
- The connect token is appended only to an in-memory URL object and scrubbed (`token-redaction.mts`)
  from any error thrown on a failed connect — it must never reach a log or error message.
- `html` is capped at `PAGE_MEASUREMENT_LIMITS.maxHtmlBytes` (4 MiB, `config.mts`) in the browser before it crosses the
  CDP boundary into Node; oversized pages omit `html` but still report
  `statusCode`/`hasContent`/`title`. Browser-side traversal independently stops at
  `PAGE_MEASUREMENT_LIMITS.maxTraversalWork`; completed traversals measure rendered body `innerText`,
  while exhausted traversals conservatively saturate the content signal. Hostile DOMs therefore
  cannot evade the bound with zero-byte nodes or be recorded as failed crawls merely because
  measurement was exhausted.
- `title` is read in the same browser-side evaluator and capped at `MAX_TITLE_BYTES` (16 KiB), so
  a hostile document title cannot create an unbounded CDP response.
- **Error classification (connect phase vs. navigation phase)**: a failure anywhere from
  `chromium.connectOverCDP` through the `page.route` registration — the provider connection and
  page setup, before the target URL is ever requested — throws `CrawlerConnectError`. A failure
  from `page.goto` onward — genuinely reaching (or failing to reach) the target URL — throws
  `CrawlerTimeoutError`/`CrawlerNetworkError`. The distinction matters to the caller:
  [`@workers/crawl-browser`](../../workers/crawl-browser/README.md) rethrows `CrawlerConnectError`
  for a queue retry without touching referral-link health, since a Lightpanda outage says nothing
  about whether the target link is reachable.

## Related

- Caller/queue: [`@queues/crawl-browser`](../../queues/crawl-browser/README.md)
- Parent: [`../CLAUDE.md`](../CLAUDE.md)
- SSRF primitives: [`ssrf-guard`](https://www.npmjs.com/package/ssrf-guard)
