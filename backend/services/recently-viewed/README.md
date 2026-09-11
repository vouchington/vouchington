# recently-viewed

Valkey-backed tracking of entities viewed by a session or authenticated user. It drives viewed user
collection pages and topic recommendations.

## Storage

Each entity type has separate Valkey sorted sets for sessions and users:

```text
recently-viewed:session:<entity-type>:<session-id>
recently-viewed:user:<entity-type>:<user-id>
```

[`upsertRecentlyViewed`](store.mts) records an entity in the available session and user sets. It
uses the Valkey server time as an epoch-millisecond score and advances ties monotonically, keeps at
most 1,000 IDs per set, and refreshes a 30-day TTL. There are no PostgreSQL recently-viewed event
tables.

[`searchRecentlyViewed`](store.mts) returns newest-first IDs. For authenticated requests with both
scopes, it merges the session and user sets, deduplicates each entity ID, and retains the highest
(most recent) score. [`searchRecentlyViewedPage`](store.mts) provides stable reverse-score,
ID-tiebreaker pagination for user collection pages. [`countRecentlyViewed`](store.mts) uses `ZCARD`
for exact counts within the capped user set.

## Service API

```ts
addRecentlyViewed(sessionId, userId | null, entityType, entityId)
getRecentlyViewedIds(sessionId, userId | null, entityType, limit?)
```

[`addRecentlyViewed`](add.mts) validates IDs, skips self-views for `user`, writes the Valkey sets,
and emits a fire-and-forget analytics event. [`getRecentlyViewedIds`](get.mts) validates the
request scope and delegates to `searchRecentlyViewed`.

## Entity Types

- `topic`
- `post`
- `rss_feed_item`
- `rss_feed`
- `user`
- `landing_page`

## Consumers

- **Viewed collections** use `searchRecentlyViewedPage` in
  [`profile-collections-paginated.mts`](../entity-fetch/profile-collections-paginated.mts),
  [`profile-collections-rss-feed-items.mts`](../entity-fetch/profile-collections-rss-feed-items.mts),
  and [`get-rss-feeds-collection.mts`](../entity-fetch/get-rss-feeds-collection.mts). RSS feeds
  use the `rss_feed` entity type.
- **Topic recommendations** use `searchRecentlyViewed` for the user's `post` and `rss_feed_item`
  histories in [`query-builder.mts`](../recommended-topics/query-builder.mts).
- **User metrics** use `countRecentlyViewed` for topic, RSS-feed-item, and RSS-feed counts in
  [`metrics-private-counts.mts`](../entity-fetch/metrics-private-counts.mts).

## Related

- [Recommended Topics Service](../recommended-topics/README.md)
- [Users Service](../users/README.md)
