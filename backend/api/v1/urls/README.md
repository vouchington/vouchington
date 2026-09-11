# URLs API

Search and manage URLs, crawl history, and trigger crawls.

## Endpoints

| Method | Route                              | Authentication               | Description                      |
| ------ | ---------------------------------- | ---------------------------- | -------------------------------- |
| GET    | `/api/v1/urls`                     | Optional                     | Search URLs                      |
| GET    | `/api/v1/urls/:id`                 | Required                     | Get URL detail with latest crawl |
| POST   | `/api/v1/urls/:id/crawl`           | Required                     | Trigger a crawl for a URL        |
| GET    | `/api/v1/urls/:id/crawls`          | Required (Plus/Pro or admin) | List crawl history for a URL     |
| GET    | `/api/v1/urls/:id/crawls/:crawlId` | Required (Plus/Pro or admin) | Get a specific crawl             |

## GET /api/v1/urls

Query parameters:

- `query` — text search query
- `hostnameId` — filter by hostname ID
- `contentTypeId` — filter by content type ID
- `after` — cursor for pagination
- `limit` — max results

## GET /api/v1/urls/:id

Returns `{ url, latest_crawl }` — the URL record plus the most recent successful crawl.

`latest_crawl` uses the paid-safe crawl-history projection for non-admin users: only its identifier,
timestamps, response status, title, and language. Administrators receive the raw crawl row.

## POST /api/v1/urls/:id/crawl

Enqueues the correct crawl job for the URL. RSS feed URLs route to the RSS feed queue, active
referral-link URLs route to the referral-link crawl queue, and all other URLs route to the HTML
crawler.

Response:

```json
{
  "success": true,
  "message": "Crawl enqueued",
  "target": "html_url",
  "enqueued_count": 1
}
```

## GET /api/v1/urls/:id/crawls

Lists crawl history for a URL.

Eligible Plus/Pro callers receive the same paid-safe summary shape as `latest_crawl` above.
Administrators receive raw crawl rows.

Query parameters:

- `after` — cursor for pagination
- `limit` — max results

During the temporary cursor-scope rollout, this URL-fixed route accepts the previous `{ id }`
cursor shape as well as the current URL-scoped shape. It only emits scoped cursors, and scoped
cursors must match the requested URL.

## Performance

| Endpoint                             | Round Trips | Caching          | Notes                                                                   |
| ------------------------------------ | ----------- | ---------------- | ----------------------------------------------------------------------- |
| GET /api/v1/urls                     | 1           | None             | Auth-only search                                                        |
| GET /api/v1/urls/:id                 | 2–3         | Entities: Valkey | Fetch URL → membership check (non-admin) → latest crawl (if authorized) |
| POST /api/v1/urls/:id/crawl          | 2–3         | Entities: Valkey | Assert access + route to RSS/referral/HTML queue                        |
| GET /api/v1/urls/:id/crawls          | 3           | Entities: Valkey | Membership check → fetch URL → search crawls                            |
| GET /api/v1/urls/:id/crawls/:crawlId | 3           | Entities: Valkey | Membership check → fetch URL → get crawl                                |

`GET /api/v1/urls/:id/crawls/:crawlId` returns the same paid-safe projection to eligible Plus/Pro
callers, including no extracted markdown, links, metadata, or sideloaded Open Graph image.
Administrators receive the raw crawl row and sideloaded image.

## Related

- Service: [backend/services/urls/README.md](../../../services/urls/README.md), [backend/services/crawls/README.md](../../../services/crawls/README.md)
- Hostnames: [../hostnames/README.md](../hostnames/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
