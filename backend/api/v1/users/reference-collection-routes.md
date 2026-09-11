# Collection Routes

[Back to Users API](README.md#collection-routes)

- Public collections:
  - `topics/following`
  - `users/following`
  - `users/followers`
  - `rss-feeds/following`
  - `communities/member`
- Owner/admin-only collections:
  - `posts/saved|hidden|following|subscribed`
  - `topics/blocked|muted|viewed`
  - `users/blocked|muted`
  - `rss-feeds/subscribed` — owner only; returns feeds the user subscribed to for new-article notifications (predicate `subscribe`)
  - `rss-feeds/muted` — owner only
  - `rss-feeds/viewed` — owner only
  - `rss-feed-items/saved|viewed`

Collection routes return `{ results, page_info }`. The public `topics/following`, owner-only
`topics/viewed`, public `users/following|followers`, `rss-feeds/:listType`, and public
`communities/member` lists accept bounded `limit` and opaque `after` cursors. Callers must pass
`page_info.end_cursor` unchanged; cursors for followed topics and community memberships are scoped
to the target user and collection. Followed topics use a descending relation timestamp and topic-ID
cursor. Community membership pagination applies profile, community, and roster visibility before
constructing each page. The `rss-feeds/:listType` route additionally returns election and bookmark
sidecars — see below.

Private post collections accept `limit` (default/max 100) and opaque `after`. Their scoped cursor
binds the target user, list type, relation timestamp, post UUID, and descending order. Visibility is
applied before the page boundary, including comment-root, clearance, private-audience, and
community membership/review rules, so `has_next_page` reflects visible rows rather than raw saved
relations.

### GET /api/v1/users/:idOrSlug/rss-feeds/:listType

`listType` must be `following`, `subscribed`, `muted`, or `viewed`.

Query parameters:

- `limit` — results per page (min 1, default 25, max 25)
- `after` — opaque cursor from `page_info.end_cursor`; advances to the next page. Returns 400 for an invalid cursor.
- `feed_type` — filter by feed type: `article`, `podcast`, `video`, or `mixed`. Returns 400 for an invalid value.

`following`, `subscribed`, and `muted` use a timestamp-based keyset over `(created_at, object_id)` on the underlying relation table, so the ordering is stable across pages even when new follows are added. Viewed+`feed_type` uses scoped score cursors over the remaining recently-viewed Valkey ZSET (`user:{id}:rss-feeds:viewed:{feedType}`); unfiltered viewed stays a single terminal page.

The response also includes the same election and bookmark sidecars as `GET /api/v1/rss-feeds`:

- `topic_elections` — keyed by topic ID (always present, may be `{}`)
- `hostname_elections` — keyed by hostname ID (always present, may be `{}`)
- `election_votes` — keyed by topic ID; present when the viewer has voted on one or more topics
- `bookmarks` — keyed by RSS feed or topic ID; present when the viewer has bookmarked any feed or topic on the page

`election_votes` and `bookmarks` are omitted for anonymous viewers and when there is no relevant data. The viewer-keyed data always reflects the **requesting viewer**, not the profile owner.
