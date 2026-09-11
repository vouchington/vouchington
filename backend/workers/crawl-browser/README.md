# Crawl Browser Worker

Worker package for browser-backed crawl jobs.

## Exports

- `crawlBrowser` - worker instance for the `crawl_browser` queue.

## Retry classification (`handleBrowserCrawlError`)

`handleBrowserCrawlError` distinguishes provider/connect-phase failures from target-link health
failures, since [`@services/browser-crawl`](../../services/browser-crawl/README.md) throws a
different error class for each:

- `CrawlerRateLimitError` and `CrawlerConnectError` (Lightpanda CDP rate-limit/timeout/connect
  failures — the target URL was never requested) are rethrown so GlideMQ retries the job with
  backoff. The referral link's crawl status is left untouched.
- `CrawlerTimeoutError`, `CrawlerNetworkError`, `CrawlerSsrfError`, and `HttpNoBodyError` (target
  navigation failures) mark the referral link `success: false` and are swallowed (no retry) — a
  navigation failure is a real signal about the link's health.

A dropped connect-phase job self-heals: `@services/crawler-referral-links`'s dispatcher re-selects
links whose `last_crawl_success_at`/`last_crawl_failure_at` weren't advanced and re-enqueues them on
its next scheduled run.

## Related

- Queue surface: [../../queues/crawl-browser/README.md](../../queues/crawl-browser/README.md)
- Worker entrypoint: [../../entrypoints/worker-cpu/README.md](../../entrypoints/worker-cpu/README.md)
- Browser-crawl service: [../../services/browser-crawl/README.md](../../services/browser-crawl/README.md)
