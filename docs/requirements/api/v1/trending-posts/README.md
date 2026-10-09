# Trending Posts API

Source entrypoint: [backend/api/v1/trending-posts/README.md](../../../../../backend/api/v1/trending-posts/README.md)

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

- Service: [../../../services/trending-posts/](../../../../overview/architecture/services/trending-posts/README.md)
- Parent: [../../AGENTS.md](../../../../../backend/api/AGENTS.md)

## Live pagination

The opaque `after` cursor retains its score and post UUID. When that post exists, the query recomputes its boundary score using the same SQL statement clock and hot-score expression as the returned rows; the stored score is intentionally not used for an existing post. This prevents the boundary row repeating solely because its score decayed between requests. A soft-deleted post still supplies the boundary but is excluded from results. If the cursor UUID has no post row, its supplied score remains the boundary.

Pagination follows live ranking, not a snapshot: vote changes, eligibility changes, or future-dated rows moving through the age-zero clamp can change traversal membership. Returned scores keep their current time-decay meaning, and the cursor shape and UUID validation remain unchanged. REST and MCP share this service behavior.
