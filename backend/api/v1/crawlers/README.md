# Crawlers API

Manage web crawlers associated with hostnames.

## Endpoints

| Method | Route                  | Authentication   | Description                                                          |
| ------ | ---------------------- | ---------------- | -------------------------------------------------------------------- |
| GET    | `/api/v1/crawlers`     | Required (admin) | List all crawlers (paginated) or filter by hostname/referral program |
| GET    | `/api/v1/crawlers/:id` | Optional         | Get a crawler by ID                                                  |
| PATCH  | `/api/v1/crawlers/:id` | Required         | Update a crawler                                                     |

## GET /api/v1/crawlers

When neither `hostname_id` nor `referral_program_id` is provided, returns a paginated list of all crawlers ordered by `created_at DESC`.

Query parameters:

- `hostname_id` — filter by hostname UUID
- `referral_program_id` — filter by referral program UUID
- `limit` — results per page (default 25, max 100); only applies to list-all mode
- `after` — opaque cursor for pagination; only applies to list-all mode

**Response (list-all mode):** `{ results: Crawler[], page_info: PageInfo }`

**Response (filtered mode):** `{ results: Crawler[] }`

## GET /api/v1/crawlers/:id

Returns `{ crawler }`. Access is filtered based on user permissions via `getCrawlerByIdForUser`.

## PATCH /api/v1/crawlers/:id

Updates the crawler configuration.

**Request:** JSON body with updatable crawler fields.

**Response:** `{ crawler }` with the updated crawler.

## Performance

| Endpoint                        | Round Trips | Caching      | Notes                                             |
| ------------------------------- | ----------- | ------------ | ------------------------------------------------- |
| GET /api/v1/crawlers (list-all) | 1           | None         | Admin auth check + paginated DB query             |
| GET /api/v1/crawlers (filtered) | 1           | None         | Admin auth check + filtered DB query              |
| GET /api/v1/crawlers/:id        | 2           | None         | Auth check, service lookup with permission filter |
| PATCH /api/v1/crawlers/:id      | 2           | None (write) | Auth check, service update                        |

## Related

- Service: [../../services/crawlers/](../../../services/crawlers/README.md)
- Hostnames: [../hostnames/README.md](../hostnames/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
