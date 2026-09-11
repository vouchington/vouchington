# Recommended RSS Feeds Service

Provides personalized RSS feed recommendations for logged-in users.

## Ranking Algorithm

Recommendations are weighted from three independent sources:

1. **Friends** (weight: 3.0)
   - Feeds followed by users that the current user follows
   - Signals: "my friends find this feed valuable"

2. **Topic** (weight: 2.5)
   - Feeds linked to topics the current user follows
   - Signals: "this feed covers topics I care about"

3. **Collaborative** (weight: 2.0)
   - Feeds followed by users who share feed follow overlap with the current user
   - Signals: "users who follow the same feeds as me also follow this"

Recommendations are sorted by composite score (descending).

## Filtering

Excludes:

- Feeds the user already follows
- Feeds the user has muted

## Data Dependencies

The service queries:

- `rss_feeds` — feed metadata (must not be deleted, must be enabled)
- `relation__user__follow__user` — local user follow graph, `deleted_at IS NULL` (for friend-based recommendations)
- `relation__user__follow__topic` — topic follows (for topic-based recommendations)
- `relation__user__follow__rss_feed` — user's current follows (to exclude) and which feeds other users follow (for collaborative filtering)
- `relation__user__mute__rss_feed` — user's mutes (to exclude)

## Integration

Called by `GET /api/v1/rss-feeds/recommended` endpoint.

- Authenticated users only
- Personalized per user
- Cursor-paginated

Optional source filter allows users to see recommendations from a single weighting source.

## Related

- API: [../../api/v1/rss-feeds/README.md](../../api/v1/rss-feeds/README.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
