# URL Hostnames Service

Hostname lookup, search, trust, and metadata helpers used by URL, RSS feed, and crawl features.

Batch hostname writes deduplicate and use hostname order before `ON CONFLICT`, so concurrent URL
ingests take matching unique-index locks.

## Core Fields

| Field                      | Meaning                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `crawlable`                | When explicitly `false`, crawling is disabled for the hostname                               |
| `blocked`                  | When `true`, the domain is disallowed from site surfaces                                     |
| `link_rel_follow`          | When `true`, outbound links do not get `rel="nofollow"`                                      |
| `consecutive_dns_failures` | Running count of consecutive DNS lookup failures (reset to 0 on any successful crawl)        |
| `last_dns_failure_at`      | Timestamp of the most recent DNS failure (used for the 7-day stale-counter reset)            |
| `dns_disabled_at`          | Set when the hostname is auto-disabled due to repeated DNS failures; cleared by admin action |

## DNS Auto-Disable

When a crawl gets an `ENOTFOUND` / `getaddrinfo` DNS error, or an RSS fetch gets a TLS certificate
hostname mismatch (`ERR_TLS_CERT_ALTNAME_INVALID`), the system automatically disables crawling for
that hostname after **3 consecutive failures**:

1. On each DNS failure, `recordHostnameDnsFailure(hostnameId)` is called.
2. Before incrementing the counter, a **canary DNS lookup** (against a well-known host such as
   `cloudflare.com`) validates that our own resolver is working. If the canary fails, the counter
   is left unchanged — the failure is on our side, not the target host.
3. On each TLS certificate hostname mismatch, `recordHostnameConfigurationFailure(hostnameId)` is
   called and skips the DNS canary because the failure is independent of resolver health.
4. If `last_dns_failure_at` is older than 7 days, the counter resets to 1 instead of
   incrementing (stale failures do not compound with new ones).
5. At 3 consecutive failures: `crawlable` is set to `FALSE` and `dns_disabled_at` is stamped.
6. All three crawl paths (RSS, HTML, referral-link) gate on `crawlable = false`, so the hostname
   is effectively suspended across all outbound crawl types.

Re-enabling requires an admin to clear `crawlable` and `dns_disabled_at`. The counter resets to 0
automatically on any successful crawl via `resetHostnameDnsFailures(hostnameId)`.

Key modules:

- `dns-failures.mts` — `recordHostnameDnsFailure` / `recordHostnameConfigurationFailure` / `resetHostnameDnsFailures`
- `dns-canary.mts` — `resolveDnsCanary` (external DNS check; overridable via the `resolveDnsCanary`
  key on `CrawlUrlDependencies` / `FetchRssFeedDependencies`, so tests never hit live DNS)

## Responsibilities

- search hostnames
- filter hostnames by requested topics, including descendant expansion through
  `relation__topic__parent__topic`
- fetch hostname detail in batch or singly
- compute trust-tier and social metadata
- surface top URLs for a hostname
- enforce hostname-level authorization where needed

## Related

- URLs service: [../urls/README.md](../urls/README.md)
- RSS feeds service: [../rss-feeds/README.md](../rss-feeds/README.md)
- Crawling reference: [../../../docs/overview/architecture/crawling.md](../../../docs/overview/architecture/crawling.md)
