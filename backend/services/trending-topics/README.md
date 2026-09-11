# Trending Topics

Weighted trending algorithm combining post tags and RSS feed item tags.

## Overview

This service calculates trending topics by counting recent post and RSS feed item categorizations, weighting post tags at 5x relative to RSS item tags. Results are filtered to topics with positive vote scores and paginated with score-based cursors.

## Key Files

- `get-trending-topics.mts` — Main query: combines post-topic and RSS-item-topic category relations into a weighted score, supports day/week/month time ranges, minimum score threshold, and cursor-based pagination
- `types.mts` — `TrendingTopicsOptions`, `TrendingTopicMetric`, `TrendingTopicsResult`, `TrendingTopicsTimeRange`

## Algorithm

1. **Post tags**: Count categorized posts from entity relation tables within the time range, multiply by 5
2. **RSS item tags**: Count categorized RSS feed items within the time range (weight = 1)
3. **Combined score**: `(post_count × 5) + rss_item_count`
4. **Filters**: Only items with `votes_score_net > 0` and non-deleted relations are counted

## Query Parameters

| Parameter   | Type                       | Description                        |
| ----------- | -------------------------- | ---------------------------------- |
| `timeRange` | `day` \| `week` \| `month` | Lookback period (1, 7, or 30 days) |
| `minScore`  | `number?`                  | Minimum trending score threshold   |
| `limit`     | `number`                   | Results per page (1-100)           |
| `after`     | `string?`                  | Score-based cursor for pagination  |

## Response

Each result includes:

- `id` — Topic UUID
- `trending_score` — Combined weighted score
- `post_tag_count` — Number of post categorizations
- `rss_item_tag_count` — Number of RSS item categorizations

## Architecture Notes

- Uses entity relation tables (`relation__post__category__topic`, `relation__rss_feed_item__category__topic`) rather than direct topic tables
- **Time-range filtering** uses UUIDv7 `id >= lowerBound` instead of `created_at`, following the partition-pruning convention for UUIDv7-keyed tables. This leverages the `idx_*__trending_topics` partial index on `(id, object_id) WHERE deleted_at IS NULL AND votes_score_net > 0` — `id` is the leading column so Postgres can do an index range scan starting at the UUIDv7 lower bound
- Score-based cursor pagination: sorts by `(trending_score DESC, id DESC)` with composite cursor for stable ordering
- Only counts relations with positive vote scores, filtering out downvoted categorizations

## Related

- Entity relations: [backend/services/entity-relations/README.md](../entity-relations/README.md)
- Topics: [backend/services/topics/README.md](../topics/README.md)
