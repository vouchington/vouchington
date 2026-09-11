# @services/crawler-utils

Shared low-level utilities for the HTML and RSS crawler services — URL fetching, response body reading, and HTTP error handling with analytics metrics.

## Key exports

- `fetchUrl(options: FetchUrlOptions)` — validates crawler DNS with `validateUrl()` from `ssrf-guard/node`, then fetches with timeout via the pinned dispatcher and honors an optional caller abort signal
- `readBodyAsBuffer(options: ReadBodyOptions)` — streams the response body into a buffer, honoring an optional caller abort signal and rejecting responses that exceed the max size
- `handleErrors(options: HandleErrorsOptions)` — classifies fetch errors (timeout, rate limit, server error, too large) and records analytics metrics

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- HTML crawler service: [../crawler-html/README.md](../crawler-html/README.md)
- RSS crawler service: [../crawler-rss/README.md](../crawler-rss/README.md)
