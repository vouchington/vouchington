# Entity Fetch

This helper fetches all the relevant objects for a query as topic/post/rss-feed-item searches only return IDs and cursors.

Fetch results must be shaped as keyed objects:

- `entities: Record<UUID, Entity>` - relevant entities
- `entity_metrics: Record<UUID, Metrics>` - relevant entities' metrics
- `*_elections: Record<UUID, Election>` - election sidecars keyed by entity ID for votable
  entities. Entity payloads must not contain nested `election` objects or raw vote aggregate fields.
- If the user is logged in:
  - `bookmarks: Record<UUID, BookmarkFlags>` - relevant bookmarks for returned entities
    - For posts, include bookmarks for both the posts and the posts' creators
  - `election_votes: Record<UUID, ElectionVote>` - relevant election votes
    - Include votes for `posts.election_id`
    - Include votes for `rss_feed_items.election_id`

All queries should use batch calls from `@services/entity-cache`. Election sidecars must use the
cached batch election helpers (`get*ElectionByIdCachedBatch`) so list responses do not issue
per-entity election fetches.

## Related

- [Entity Cache Service](../entity-cache/README.md)
- [Search Overview](../../../docs/overview/architecture/search.md)
