# GET /api/v1/topics/:idOrSlug

[Back to Topics API](README.md#get-apiv1topicsidorslug)

Returns the topic detail payload. Response includes `topic`, `html`, `topic_metrics`,
`topic_election`, `topic_content_update`, and `topic_categories` (array of category slugs for schema.org type mapping).
For authenticated users it may also include `bookmarks` and `election_vote`.
When `:idOrSlug` identifies a topic that was merged into another topic, the endpoint returns the
destination topic plus `topic_redirect` metadata naming the source and destination IDs so callers
can redirect to the canonical destination URL.

`topic_content_update` identifies the latest admin-authored topic content change. It is derived
from `topic_revisions` rows whose `changes` include `name` or `markdown`, not from topic metrics,
posts, RSS items, images, or other non-content metadata edits. Admin authorship is evaluated from
the revision-time role snapshot, not from the user's current roles.

`topic_metrics.count` contains public counts for:

- `discussions`
- `reviews`
- `data-points`
- `news`

For authenticated requests, `topic_metrics.viewer_count` is also returned for post tabs
(`discussions`, `reviews`, `data-points`). These counts are viewer-aware and intended for
rendering `N+` / `0+` UI without exposing restricted totals to anonymous users.
