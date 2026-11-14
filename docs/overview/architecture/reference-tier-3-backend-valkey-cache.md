# Tier 3: Backend Valkey Cache

[Back to Caching Strategy reference](reference-caching-strategy-cache-tiers.md#tier-3-backend-valkey-cache)

#### Entity Cache

Single-entity lookups cached in Valkey with stale-while-revalidate. Config: `backend/services/entity-cache/config.mts`.

| Entity                                                                                                                                                                         | TTL   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Posts, topics, user metrics, post metrics, topic metrics                                                                                                                       | 1h    |
| Post elections, topic elections, hostname elections, entity relation elections, agent moderation elections, RSS feed item elections, RSS feeds, RSS feed items, users (public) | short |
| Users (private)                                                                                                                                                                | 1h    |
| Lookup caches (users, topics, posts, URLs)                                                                                                                                     | 24h   |
| URLs, URL hostnames                                                                                                                                                            | 24h   |

Entity cache uses batch fetching (`get*CachedBatch`) and asynchronous re-fetching when TTLs are about to expire.

Election summaries use the same cached batch contract. Client-facing API responses return election
data as sidecars (`post_elections`, `topic_elections`, `hostname_elections`,
`rss_feed_item_elections`, or singular detail sidecars) fetched through `get*ElectionByIdCachedBatch`.
The entity VIEW payload itself must not include nested `election` objects or raw vote aggregates.

Topic metrics cache only stores public-safe values. For topics this includes public tab counts
(`discussions`, `reviews`, `data-points`, `news`, `latest`) plus ratings/bookmark aggregates. Each
tab count is exact up to the profile count cap and `count_capped` records when the number stopped
there. Any
viewer-aware tab counts used for `N+` / `0+` UI are computed at request time for authenticated
topic detail responses and are not written into the shared entity cache.

#### Search/List Cache

Cached wrappers for list/search queries, used for logged-out users only. Config: `backend/services/entity-cache/search-cache.mts`.

| Cache           | Key prefix              | TTL |
| --------------- | ----------------------- | --- |
| Post IDs        | `post_ids_anon`         | 60s |
| Topic IDs       | `topic_ids_anon`        | 60s |
| RSS feeds       | `rss_feeds_anon`        | 60s |
| RSS feed items  | `rss_feed_items_anon`   | 60s |
| Communities     | `communities_anon`      | 60s |
| Trending topics | `trending_topics_anon`  | 60s |
| URL hostnames   | `url_hostnames_anon_v2` | 60s |
| Trending posts  | `trending_posts_anon`   | 60s |
| Platform stats  | `platform_stats_anon`   | 60s |

Search cache owns its Valkey TTL independently of HTTP headers and the Worker's cache policy.
Cache keys use SHA-256 hashing of stable-serialized options for deterministic, case-sensitive keys.

Anonymous search entries expire naturally. Playwright global setup clears its test cache before
browser runs so seeded pages do not see results from an earlier run. `GET /api/v1/urls` requires
authentication and has no anonymous search cache; single URL and URL hostname entity caches use
the entity TTL above.

Anonymous RSS, web search, and hashtag resolution reuse backend caches across edge misses.
RSS description caching includes the author-role lookup used to render trusted HTML.
Cached publication state is served without a request-time database recheck, including when
filtering Hacker News references. The Worker owns edge TTL policy; Cache-Tag purging is
reserved for legal copyright and user deletion, never freshness.

RSS post snapshots bind public eligibility and response content in one database read on cache
miss. They are isolated from the mutable entity cache: retained search IDs cannot hydrate a
private edit, while a warm RSS snapshot can continue serving its previously public content.
Legal removal advances the RSS snapshot namespace before edge purging. The generation is
read from Valkey's primary and is never advanced for an ordinary edit or a completed restore.
Copyright withholds and restore denials share one legal-removal hook. It runs only after the
public projection change has committed and before the intent outcome commits, so that commit
is the eviction receipt and a failure leaves the intent owed. User deletion runs the same
surfaces from its durable legal-removal work row, which recovery retries until it succeeds.
Retired snapshots expire naturally without a key scan.
