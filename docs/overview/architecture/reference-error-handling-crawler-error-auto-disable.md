# Error Handling reference

[Back to Error Handling](error-handling.md)

## Crawler Error Auto-Disable

Persistent DNS failures automatically disable crawling for a hostname. See
[backend/services/urls-hostnames/README.md](../../../backend/services/urls-hostnames/README.md)
for the full counter semantics, canary logic, and admin re-enable procedure.

Key error types involved (`backend/modules/on-error/errors.mts`):

| Error class           | Status | Trigger                                            |
| --------------------- | ------ | -------------------------------------------------- |
| `CrawlerNetworkError` | 502    | Fetch-level failure; DNS classified by cause chain |
| `CrawlerTimeoutError` | 504    | Request exceeded timeout                           |
| `CrawlerSsrfError`    | 403    | SSRF protection blocked the request                |

`isCrawlerNetworkDnsError(error)` (exported from `@modules/on-error/errors`) walks the `.cause`
chain looking for `ENOTFOUND` / `getaddrinfo` strings. Only DNS errors increment the auto-disable
counter.
