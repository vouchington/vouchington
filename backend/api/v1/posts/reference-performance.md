# Performance

[Back to Posts API](README.md#performance)

| Endpoint                                           | Round Trips | Caching                                                                 | Notes                                                                                                    |
| -------------------------------------------------- | ----------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET /api/v1/posts                                  | 3           | Search: anon Valkey; Entities: Valkey batch; HTTP: Cache-Control (anon) | Search + parallel streaming (posts, metrics, elections, markdown, bookmarks, votes)                      |
| POST /api/v1/posts                                 | 5           | None                                                                    | Auth + plan + contribution gating (2) + create                                                           |
| GET /api/v1/posts/:idOrSlug                        | 5           | Entities: Valkey; HTTP: Cache-Control (anon)                            | Auth + entity + access check + markdown render + parallel streaming (metrics, election, bookmarks, vote) |
| GET /api/v1/posts/:idOrSlug/follow-context         | 4           | None                                                                    | Auth + entity + access check + parallel follow queries                                                   |
| PATCH /api/v1/posts/:idOrSlug                      | 4           | None                                                                    | Auth + entity + access check + update                                                                    |
| DELETE /api/v1/posts/:idOrSlug                     | 4           | None                                                                    | Auth + entity + access check + delete                                                                    |
| POST /api/v1/posts/:idOrSlug/lock                  | 4           | None                                                                    | Auth + entity + access check + lock (optional membership lookup)                                         |
| DELETE /api/v1/posts/:idOrSlug/lock                | 4           | None                                                                    | Auth + entity + access check + unlock (optional membership lookup)                                       |
| POST /api/v1/posts/:idOrSlug/clearances            | 3           | None                                                                    | Auth + entity + update clearance                                                                         |
| POST /api/v1/posts/:idOrSlug/shares                | 2           | None                                                                    | Auth + queue follower distribution                                                                       |
| POST /api/v1/posts/:idOrSlug/sends                 | 3           | None                                                                    | Auth + queue follower distribution + chunked push delivery                                               |
| GET /api/v1/posts/:idOrSlug/descendants            | 4           | Entities: Valkey batch; HTTP: Cache-Control (anon)                      | Auth + entity + comment IDs + parallel streaming (posts, metrics, markdown, votes)                       |
| GET /api/v1/posts/:idOrSlug/comments/chronological | 4           | Entities: Valkey batch; HTTP: Cache-Control (anon)                      | Auth + entity + chronological query + parallel streaming                                                 |
| GET /api/v1/posts/:idOrSlug/ancestors              | 4           | Entities: Valkey batch; HTTP: no edge cache (see below)                 | Auth + ancestors query + root access + parallel streaming                                                |
| GET /api/v1/posts/:idOrSlug/images                 | 3           | HTTP: Cache-Control + Vary (anon)                                       | Auth + entity + get images                                                                               |
| PUT /api/v1/posts/:idOrSlug/images                 | 3           | None                                                                    | Auth + entity + set images                                                                               |
| POST /api/v1/posts/:idOrSlug/ratings               | 5           | None                                                                    | Auth + plan + contribution gating (2) + entity + add rating                                              |
| PATCH /api/v1/posts/:idOrSlug/ratings/:topicId     | 5           | None                                                                    | Auth + plan + contribution gating (2) + entity + update                                                  |
| DELETE /api/v1/posts/:idOrSlug/ratings/:topicId    | 3           | None                                                                    | Auth + entity + delete rating                                                                            |
| PUT /api/v1/posts/:id/vote                         | 3           | None                                                                    | Auth + entity + upsert vote                                                                              |
| GET /api/v1/posts/:id/votes                        | 3           | None                                                                    | Auth + entity + votes query                                                                              |

`GET /api/v1/posts/:idOrSlug/ancestors` sets `Cache-Control: private, no-store`. The edge
Cache-Tag scheme ([ts-shared/cache/cache-tags.mts](../../../../ts-shared/cache/cache-tags.mts))
tags API detail routes by a single leaf `idOrSlug`, but this response embeds every ancestor
post. Editing a parent post would leave a stale cached response with no tag to purge it by, so
the route explicitly opts out of edge caching instead of risking stale ancestor data — the edge
`CachedOrigin` caches any 2xx response lacking an explicit `private`/`no-store`/`no-cache`
directive, so omitting `Cache-Control` would not have been a bypass.

Post-list and comment hydration computes descendant, direct-child, ancestor, follow, save, and
freshness metrics as set-based aggregates constrained to the requested post IDs. Singular post
metrics retain their focused query. The EXPLAIN suite exercises the batch loader with 200 post IDs
under both custom and generic prepared plans.
