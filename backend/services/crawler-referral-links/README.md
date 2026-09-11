# crawler-referral-links

Service for crawling active referral program links to verify they are live and reachable.

## Purpose

Crawls URLs associated with active `user_referral_program_links` entries to detect broken or removed links. Crawls are performed without creating embeddings (`skipChunks: true`) since we only need to verify page existence, not index content.

## Crawl Behavior

- Links are crawled at most once every 7 days on success
- Failed links are retried after 1 hour
- Only active links (`activated_at IS NOT NULL`, `deactivated_at IS NULL`) on crawlable, unblocked hostnames are dispatched
- robots.txt is checked before crawling regardless of crawler type — disallowed URLs are skipped without updating link status
- The scheduled dispatcher awaits child crawl job enqueue by hostname; enqueue failure fails the dispatcher so a retry or admin-triggered run re-scans durable link state
- The scheduled worker calls the dispatcher without options, which scans all eligible durable links
- Scoped dispatcher calls may provide `referralLinkIds`: omitting it keeps the full scan, a non-empty list selects only those eligible links, and an empty list dispatches nothing

## Crawler Type

Each hostname has a crawler record with a `crawler_type`:

- **`fetch`** — plain HTTP request via `crawlUrl`; suitable for server-rendered pages
- **`automation`** — headless browser via the `crawl_browser` queue (worker-cpu), which connects to Lightpanda's cloud browser over Playwright; for CSR pages that require JavaScript to render content

The crawler type is set per-hostname by an admin via `PATCH /api/v1/crawlers/:id`. See the [system README](../../queues/crawl-referral-links/README.md) for the full decision guide.

## Auto-Deactivation

Links are automatically deactivated based on crawl results:

| Condition                        | Action                                  |
| -------------------------------- | --------------------------------------- |
| HTTP 404 or 410                  | Immediate deactivation                  |
| Other failure                    | Increment `consecutive_crawl_failures`  |
| `consecutive_crawl_failures` ≥ 3 | Deactivate link                         |
| Success                          | Reset `consecutive_crawl_failures` to 0 |

## Modules

- `dispatch.mts` — Queries active links needing a crawl, groups by hostname, enqueues jobs
- `update-link-status.mts` — Updates link status after crawl (success / failure / immediate deactivation)
- `types.mts` — Shared types

## Related

- System: [../../queues/crawl-referral-links/README.md](../../queues/crawl-referral-links/README.md)
- Browser-crawl service: [../browser-crawl/](../browser-crawl/README.md)
