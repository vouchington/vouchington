# crawl-referral-links

Crawls active referral program link URLs to verify they are live and auto-deactivates broken links.

See [Crawling Architecture](../../../docs/overview/architecture/crawling.md) for the referral-link fetch and automation flow.

## Processors

| Queue                  | Processor                         | Schedule                  |
| ---------------------- | --------------------------------- | ------------------------- |
| `crawl_referral_links` | `crawl_referral_links_dispatcher` | Weekly Sunday at 4 AM UTC |
| `crawl_referral_links` | `crawl_referral_link`             | Enqueued by dispatcher    |

## Architecture

The dispatcher queries all active referral links needing a crawl and awaits per-link crawl job
enqueue by hostname with per-hostname rate limiting. A bulk enqueue failure fails the dispatcher job,
so the scheduled retry or admin-triggered dispatcher re-scans durable link state instead of treating
child queue state as the recovery signal.

Each `crawl_referral_link` job:

1. Looks up the URL and ensures a crawler record exists for its hostname
2. Crawls the URL using the crawler type assigned to that hostname
3. Updates the link status based on the result

## Queue-Local Facts

- `fetch` uses the standard HTTP crawler (`crawlUrl`) and is the default path for server-rendered pages.
- `automation` enqueues `crawl_browser` for client-side rendered pages.
- The `crawler_type` field is set per hostname, so every referral link under that hostname follows the same path.
- `crawl_referral_link` jobs use full HTML crawl output with markdown, but no embeddings.

## Deactivation

| Condition                        | Action                                  |
| -------------------------------- | --------------------------------------- |
| HTTP 404 or 410 (either path)    | Immediate deactivation                  |
| Other failure                    | Increment `consecutive_crawl_failures`  |
| `consecutive_crawl_failures` ≥ 3 | Deactivate link                         |
| Success                          | Reset `consecutive_crawl_failures` to 0 |

## Related

- Service: `@services/crawler-referral-links`
- Browser-crawl system: `@queues/crawl-browser`
- Backend browser-crawl service: `@services/browser-crawl`
- Parent: [../CLAUDE.md](../CLAUDE.md)
- [docs/requirements/users/REFERRAL-LINKS.md](../../../docs/requirements/users/REFERRAL-LINKS.md)
