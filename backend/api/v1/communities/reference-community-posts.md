# Community Posts

[Back to Communities API](README.md#community-posts)

`GET /api/v1/communities/:idOrSlug/posts` returns approved community-scoped posts for the
community. Query parameters:

- `q` — full-text search with `#topic` hashtag resolution
- `sort` — `new` or `hot`; unsupported values fall back to `new`
- `limit` — integer 1–100
- `after` — opaque cursor from `page_info.end_cursor`

Pinned posts are included as `pinned_post_ids` on the unfiltered first page and excluded from
`results` so the frontend can render them once above the paginated list.
