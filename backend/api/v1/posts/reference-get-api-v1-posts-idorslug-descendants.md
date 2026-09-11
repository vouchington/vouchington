# GET /api/v1/posts/:idOrSlug/descendants

[Back to Posts API](README.md#get-apiv1postsidorslugdescendants)

Returns a comment subtree as a flat paginated list. The route accepts `limit` (1–200, default 100)
and an opaque `after` cursor scoped to both the resolved root and selected subtree start. The
recursive query applies the canonical direct-access predicate before UUIDv7 keyset pagination, so
`limit + 1` and cursors always describe visible comments.
Response includes `results`, `posts`, `posts_metrics`, `post_elections`, `markdown_to_html`, and for
authenticated users: `election_votes`. `post_elections` is keyed by comment id and includes vote
counts so the comment tree can render vote buttons without an additional request.

Query parameters:

- `community_id` — optional community filter (UUID to show global + that community, or `'global'` to show only global comments). Only honored for authenticated users who are members of the specified community; otherwise falls back to membership-based visibility.
