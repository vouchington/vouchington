# GET /api/v1/hostnames/blocked

[Back to Hostnames API](README.md#get-apiv1hostnamesblocked)

Lists all blocked hostnames, paginated.

**Admin only.** Returns 401 for unauthenticated, 403 for non-admin.

Query parameters:

- `limit` — max results (default: 25)
- `after` — cursor for pagination

Response: `{ results: [{ id, hostname, blocked_at, blocked_by_id, ... }], page_info: {...} }`
