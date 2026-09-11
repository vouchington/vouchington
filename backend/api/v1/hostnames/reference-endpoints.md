# Endpoints

[Back to Hostnames API](README.md#endpoints)

| Method | Route                         | Authentication  | Description                                                   |
| ------ | ----------------------------- | --------------- | ------------------------------------------------------------- |
| GET    | `/api/v1/hostnames`           | Optional        | Search hostnames                                              |
| POST   | `/api/v1/hostnames`           | Admin only      | Upsert hostname by string, optionally block                   |
| GET    | `/api/v1/hostnames/blocked`   | Admin only      | List all blocked hostnames                                    |
| GET    | `/api/v1/hostnames/:id`       | Optional        | Get hostname detail with crawlers                             |
| PATCH  | `/api/v1/hostnames/:id`       | Admin only      | Update hostname (block/unblock, etc.)                         |
| PUT    | `/api/v1/hostnames/:id/vote`  | Required        | Cast or update a hostname trust vote                          |
| GET    | `/api/v1/hostnames/:id/votes` | Required        | List the caller's own vote; admins list all votes (paginated) |
| GET    | `/api/v1/hostnames/top`       | Optional        | Top trusted domains (all topics)                              |
| GET    | `/api/v1/hostnames/social`    | Required (auth) | Trusted domains (personalized)                                |
| GET    | `/api/v1/hostnames/compare`   | Optional        | Compare multiple domains side-by-side                         |

## GET /api/v1/hostnames/:id/votes

Admins list all voters; other authenticated users see only their own vote.

Query parameters:

- `after` — opaque cursor from `page_info.end_cursor`; advances to the next page. Returns 400 for an invalid or cross-resource/cross-branch/cross-user cursor.
- `limit` — results per page (1–100, default 100)

Response includes `results` and `page_info`.
