# Feeds API

Personalized feeds for authenticated users.

## Endpoints

| Method | Route                                     | Authentication | Description                              |
| ------ | ----------------------------------------- | -------------- | ---------------------------------------- |
| GET    | `/api/v1/feeds/posts/:feed_type`          | Required       | Get paginated post feed by type          |
| GET    | `/api/v1/feeds/rss_feed_items/:feed_type` | Required       | Get paginated RSS feed item feed by type |

## GET /api/v1/feeds/posts/:feed_type

Returns a personalized feed of posts for the authenticated user.

Query parameters:

- `after` — cursor for pagination
- `limit` — 1–100, default 25
- `community` — optional community slug/ID scope for community-specific feeds
- `post_types` — filter by post types
- `q` — full-text search query. `#topic-slug` tokens are parsed as universal topic filters and removed from the text query; unresolved hashtag topics return `400 { "error": "Topic not found: #topic-slug" }`.
- `time_range` — time range filter
- `min_score_follow_users` — minimum score from followed users
- `min_score_follow_topics` — minimum score from followed topics

Response includes: `results`, `page_info`, `posts`, `posts_metrics`, `post_elections`, `bookmarks`, `election_votes` (streamed).
Each `result` row has its own feed-event `id`, the underlying `entity_id`, `delivery_type`
(`direct` or `share`), and optional `shared_by_user_id` / `shared_at` fields for shared rows. The
stream also includes a `users` map for shared-by attribution.

## GET /api/v1/feeds/rss_feed_items/:feed_type

Returns a personalized feed of RSS feed items for the authenticated user.

Query parameters:

- `after` — cursor for pagination
- `limit` — 1–100, default 25
- `community` — optional community slug/ID scope for community-specific feeds
- `q` — full-text search query. `#topic-slug` tokens are parsed as topic filters and removed from the text query; unresolved hashtag topics return `400 { "error": "Topic not found: #topic-slug" }`.
- `time_range` — time range filter
- `min_score_follow_rss_feeds` — minimum score from followed RSS feeds
- `min_score_follow_topics` — minimum score from followed topics
- `similar_window_days` — window for deduplicating similar items
- `media_type` / `media_types` — filter by media type: `article`, `audio`, `video` (singular or comma-separated; both parameter names accepted)

Response includes: `results`, `page_info`, `rss_feed_items`, `rss_feed_item_embeds`, `rss_feed_item_elections`, `bookmarks`, `election_votes` (streamed). The item-keyed embed sidecar carries backend-selected display text and authorized image/player projections; complete raw crawl metadata and oEmbed provenance are administrator-only.
Each `result` row has its own feed-event `id`, the underlying `entity_id`, `delivery_type`
(`direct` or `share`), and optional `shared_by_user_id` / `shared_at` fields for shared rows. The
stream also includes a `users` map for shared-by attribution.

## Performance

| Endpoint                                    | Round Trips | Caching                | Notes                                                                                                                                                                               |
| ------------------------------------------- | ----------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /api/v1/feeds/posts/:feed_type          | 2           | Entities: Valkey batch | Feed query, then parallel streaming (posts, metrics, elections, bookmarks, votes)                                                                                                   |
| GET /api/v1/feeds/rss_feed_items/:feed_type | 3           | Entities: Valkey batch | Feed query, story hydration (parallel: stories, member IDs, post\_\_stories lookup), then parallel streaming (items, item-keyed embeds, elections, related posts, bookmarks, votes) |

## Related

- Service: [../../services/feeds/](../../../services/feeds/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
