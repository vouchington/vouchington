# Performance

[Back to RSS Feeds API](README.md#performance)

| Endpoint                                  | Round Trips | Caching                                                        | Notes                                                                                                              |
| ----------------------------------------- | ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET /api/v1/rss-feeds                     | 2–3         | Search: anon Valkey; elections: Valkey batch; HTTP: short anon | Search + topic/hostname election batches via `buildRssFeedSidecars`; +1 for auth user votes + bookmarks (parallel) |
| POST /api/v1/rss-feeds                    | 3–5         | None                                                           | HTTP I/O (classify feed) + transaction (topic+feed insert) + post-tx side effects                                  |
| GET /api/v1/rss-feeds/:id                 | 2–3         | Entities: Valkey; HTTP: long anon                              | Fetch feed → membership check (non-admin) → latest crawl (if authorized)                                           |
| PATCH /api/v1/rss-feeds/:id               | 3           | Entities: Valkey                                               | Fetch → update → re-fetch                                                                                          |
| DELETE /api/v1/rss-feeds/:id              | 2           | Entities: Valkey                                               | Fetch + delete                                                                                                     |
| GET /api/v1/rss-feeds/:id/crawls          | 2           | Entities: Valkey                                               | Fetch feed + search crawls                                                                                         |
| GET /api/v1/rss-feeds/:id/crawls/:crawlId | 2           | Entities: Valkey                                               | Fetch feed + point-lookup crawl (partition-pruned)                                                                 |
| POST /api/v1/rss-feeds/:id/refreshes      | 2           | Entities: Valkey                                               | Fetch feed + enqueue refresh                                                                                       |
| GET /api/v1/rss-feeds/trending            | 2           | Search: anon Valkey; Entities: Valkey batch; HTTP: short anon  | Search → parallel streaming (feeds)                                                                                |
| GET /api/v1/rss-feeds/recommended         | 2           | Entities: Valkey batch                                         | Search → parallel streaming (feeds)                                                                                |
