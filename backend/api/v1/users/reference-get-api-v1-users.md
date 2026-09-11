# GET /api/v1/users

[Back to Users API](README.md#get-apiv1users)

Two modes depending on query parameters:

### Exact username lookup (unauthenticated or authenticated)

Query parameters:

- `username` (required) — the username to look up

Returns `{ user }`. Returns the private view if the user is looking up themselves; otherwise the public view.

### Search (authentication required)

Query parameters:

- `q` (required) — query string
- `limit` (optional, default 10, max 25) — maximum number of results
- `after` — opaque cursor from `page_info.end_cursor`

For non-admin users, `q` is a username prefix search and returns `{ results: PublicUser[], page_info }`.
For admins, `q` also supports exact user ID and exact primary email lookup, and results include
private status fields such as `email_address`, `suspended_at`, and `suspended_reason`. Requires
authentication; returns 401 if not authenticated.

`page_info` reflects real cursor pagination over the `LOWER(username)` ordering — `has_next_page`
and `end_cursor` are truncation-aware, not a fake terminal page. The cursor is scoped to the query
string and caller privilege (admin vs. non-admin see different result sets for the same `q`), so a
cursor minted for one scope 400s if replayed against another.
