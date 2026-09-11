# Trending Posts API

Discover trending posts ranked by time-decayed vote score.

## Endpoints

| Method | Route                    | Authentication | Description        |
| ------ | ------------------------ | -------------- | ------------------ |
| GET    | `/api/v1/trending-posts` | Optional       | Get trending posts |

## GET /api/v1/trending-posts

Returns posts ranked by a 3-day half-life decay score over a configurable time window.

Query parameters:

- `after` — cursor for pagination (score-based)
- `limit` — 1–100, default 20
- `time_range` — `day` (default), `week`, or `month`
- `post_type` — optional filter: `discussion`, `review`, `data_point`, or `story`
- `topic_id` — optional UUID to filter posts by topic category
- `min_score` — minimum trending score filter (≥ 0)

Response is streamed and includes: `results`, `page_info`, `posts`, `posts_metrics`, `post_elections`. For authenticated users also: `bookmarks`.

Cached (short TTL) for unauthenticated users.

## Performance

| Endpoint                   | Round Trips | Caching                             | Notes                                   |
| -------------------------- | ----------- | ----------------------------------- | --------------------------------------- |
| GET /api/v1/trending-posts | 2           | HTTP short TTL (anon); Valkey batch | Score query → parallel entity hydration |

## Related

- Service: [../../../services/trending-posts/](../../../services/trending-posts/README.md)
- Parent: [../../CLAUDE.md](../../CLAUDE.md)
