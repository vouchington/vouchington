# Trending Posts

Time-decayed vote score algorithm for surfacing trending posts.

## Overview

Calculates a decay score per post using its net vote count and age. Higher vote counts and more recent posts score higher.

## Algorithm

```
trending_score = votes_score_net * 2^(-age_seconds / half_life_seconds)
```

- **Half-life**: 3 days (259200 seconds) — a post's score halves every 3 days
- The shared [hot-score builder](../../modules/feed-query-builders/README.md#hot-score) treats future UUIDv7 timestamps as age zero, preventing future IDs from amplifying or overflowing the score
- Only posts with `votes_score_net > 0` and `deleted_at IS NULL` are included
- Excluded post types: `comment`, `topic_recommendation`

## Key Files

- `get-trending-posts.mts` — Main query using the shared hot-score builder, filters, and cursor pagination
- `types.mts` — `TrendingPostsOptions`, `TrendingPostMetric`, `TrendingPostsResult`, `TrendingPostsTimeRange`, `TrendingPostsPostType`

## Query Parameters

| Parameter   | Type                            | Description                          |
| ----------- | ------------------------------- | ------------------------------------ |
| `timeRange` | `day` \| `week` \| `month`      | Lookback window (1, 7, or 30 days)   |
| `postType`  | `discussion` \| `review` \| ... | Optional post type filter            |
| `topicId`   | `string?`                       | Optional UUID to filter by topic     |
| `minScore`  | `number?`                       | Minimum trending score threshold     |
| `limit`     | `number`                        | Results per page (1–100, default 20) |
| `after`     | `string?`                       | Score-based cursor for pagination    |

## Response

Each result includes:

- `id` — Post UUID
- `trending_score` — Time-decayed vote score

## Architecture Notes

- Uses `votes_score_net` directly from the `posts` table (a STORED generated column)
- Optional `topic_id` filter joins `relation__post__category__topic` with `votes_score_net > 0`
- Score-based cursor pagination sorted by `(trending_score DESC, id DESC)`
- Time range uses `uuid_extract_timestamp(p.id)` to leverage UUIDv7 temporal ordering

## Related

- Posts service: [backend/services/posts/README.md](../posts/README.md)
- Entity relations: [backend/services/entity-relations/README.md](../entity-relations/README.md)
- API route: [backend/api/v1/trending-posts/README.md](../../api/v1/trending-posts/README.md)
