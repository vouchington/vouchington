# crawl-browser

Headless browser crawling queue that runs with `concurrency: 1` per container, using Lightpanda's
cloud SaaS over CDP.

## Processors

| Queue           | Processor       | Enqueued by                                               |
| --------------- | --------------- | --------------------------------------------------------- |
| `crawl_browser` | `crawl_browser` | `crawl-referral-links` (automation path and CSR fallback) |

## Architecture

Each `crawl_browser` job:

1. Looks up the URL and crawler record
2. Validates hostname/IP is not local/private (synchronous literal check)
3. Checks robots.txt allows crawling
4. Connects to the Lightpanda cloud CDP endpoint (`LIGHTPANDA_CDP_URL` + `LIGHTPANDA_TOKEN`) via Playwright's `chromium.connectOverCDP`
5. Applies SSRF request interception (`assertSafeUrlSync`) and ad-blocking through a single `page.route` handler
6. Navigates to the URL and waits for JS hydration
7. Stores a crawl record and updates the referral link status

The browser runs entirely in Lightpanda's cloud (no local binary, no Docker-image browser install);
the worker opens a short-lived CDP connection per crawl and closes it when the job finishes.
Worker concurrency is hardcoded at `1` — scale horizontally by increasing `desired_count`.

## Related

- Service: `@services/browser-crawl`
- Caller: `@queues/crawl-referral-links`
- Parent: [../CLAUDE.md](../CLAUDE.md)
