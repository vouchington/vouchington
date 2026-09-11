# Tier 3: Backend Valkey Cache

[Back to Caching Strategy reference](reference-caching-strategy-cache-tiers.md#tier-3-backend-valkey-cache)

#### Entity Cache

Single-entity lookups cached in Valkey with stale-while-revalidate. Config: `backend/services/entity-cache/config.mts`.

| Entity                                                                                                                                                                         | TTL  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| Posts, topics, user metrics, post metrics, topic metrics                                                                                                                       | 1h   |
| Post elections, topic elections, hostname elections, entity relation elections, agent moderation elections, RSS feed item elections, RSS feeds, RSS feed items, users (public) | 5min |
| Users (private)                                                                                                                                                                | 1h   |
| Lookup caches (users, topics, posts, URLs)                                                                                                                                     | 24h  |
| URLs, URL hostnames                                                                                                                                                            | 24h  |

Entity cache uses batch fetching (`get*CachedBatch`) and asynchronous re-fetching when TTLs are about to expire.

Election summaries use the same cached batch contract. Client-facing API responses return election
data as sidecars (`post_elections`, `topic_elections`, `hostname_elections`,
`rss_feed_item_elections`, or singular detail sidecars) fetched through `get*ElectionByIdCachedBatch`.
The entity VIEW payload itself must not include nested `election` objects or raw vote aggregates.

Topic metrics cache only stores public-safe values. For topics this includes public tab counts
(`discussions`, `reviews`, `data-points`, `news`) plus ratings/bookmark aggregates. Any
viewer-aware tab counts used for `N+` / `0+` UI are computed at request time for authenticated
topic detail responses and are not written into the shared entity cache.

#### Search/List Cache

Cached wrappers for list/search queries, used for logged-out users only. Config: `backend/services/entity-cache/search-cache.mts`.

| Cache           | Key prefix             | TTL |
| --------------- | ---------------------- | --- |
| Post IDs        | `post_ids_anon`        | 60s |
| Topic IDs       | `topic_ids_anon`       | 60s |
| RSS feeds       | `rss_feeds_anon`       | 60s |
| RSS feed items  | `rss_feed_items_anon`  | 60s |
| Trending topics | `trending_topics_anon` | 60s |
| URLs            | `urls_anon`            | 60s |
| URL hostnames   | `url_hostnames_anon`   | 60s |

Search cache TTL aligns with `HTTP_CACHE_SHORT_MAX_AGE_SECONDS` (60s). Cache keys use SHA-256 hashing of stable-serialized options for deterministic, case-sensitive keys.
