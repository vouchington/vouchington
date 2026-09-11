# GET /api/v1/hostnames

[Back to Hostnames API](README.md#get-apiv1hostnames)

Search hostnames with optional filters.

Query parameters:

- `after` — opaque cursor from `page_info.end_cursor`
- `limit` — 1–100, default 50; anonymous requests are capped at 25
- `query` / `hostname` — case-insensitive hostname substring search
- `topic` — topic UUID, slug, or alias
- `topics` — comma-separated topic UUIDs, slugs, or aliases; at most 10 are resolved
- `topic_match` — `any` (default) or `all`. Because a hostname has one direct topic, direct `all` matching for multiple topics is empty; descendant matching can satisfy multiple roots.
- `include_descendants` — boolean; includes descendants of the selected topic roots
- `sort` — `trust` ranks by descending net vote score; the default is lexicographic hostname order
- `blocked` — admin-only moderation filter: `true`, `false`, or the literal `null` to omit the filter. Non-admin requests always exclude blocked hostnames.
- `crawlable` — admin-only moderation filter: `true`, `false`, or the literal `null` to omit the filter

`topics` uses one comma-separated value in the published API contract. The runtime parser also
accepts repeated keys for compatibility. Invalid cursors or non-positive/non-integer limits return
400; limits above 100 are clamped.

Response: `{ results: [...], page_info: {...}, hostnames: {...}, topics: {...}, hostname_elections: {...}, top_urls_by_hostname_id: {...} }`

`hostnames` entries do not include raw vote aggregate fields. Use the `hostname_elections` sidecar
map from the same response for trust/vote counts.
