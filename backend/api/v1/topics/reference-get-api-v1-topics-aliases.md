# GET /api/v1/topics/aliases

[Back to Topics API](README.md#get-apiv1topicsaliases)

Query parameters:

- `q` (required) — prefix query for alias search
- `limit` — results per page (min 1, default 24, max 100)
- `after` — opaque cursor from `page_info.end_cursor`; advances to the next page. Returns 400 for an invalid or cross-query cursor.

Returns `{ results, page_info }`. The cursor is a keyset over `topic_aliases.alias`, scoped to the search query.
