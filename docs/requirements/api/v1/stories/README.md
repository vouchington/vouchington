# Stories API

Source entrypoint: [backend/api/v1/stories/README.md](../../../../../backend/api/v1/stories/README.md)

Story detail and discussion creation for grouped RSS feed items.

## Endpoints

| Method | Route                                  | Authentication | Description                          |
| ------ | -------------------------------------- | -------------- | ------------------------------------ |
| GET    | `/api/v1/stories/:id`                  | Optional       | Get bounded, paginated story members |
| POST   | `/api/v1/stories/:storyId/discussions` | Required       | Create a discussion post             |

## GET /api/v1/stories/:id

Returns story metadata without a total count, plus at most 25 eligible members ordered by item ID descending. `limit` defaults to 25 and is capped at 25. `after` is an opaque continuation cursor. `exclude_item_id` omits the selected primary before the limit and must be repeated on continuation. Cursor scope includes story, viewer, public/administrator access, and primary exclusion; changing the page size does not invalidate it.

The response includes `story`, `item_ids` (related-only when `exclude_item_id` is supplied), `page_info`, and page-local `rss_feed_items`, `rss_feed_item_elections`, `rss_feed_item_embeds`, `rss_feed_item_thumbnail_url`, `rss_feed_item_content_html`, `related_posts_by_url_id`, `posts`, `posts_metrics`, and `story_post_ids`. Authenticated viewers also receive `bookmarks`, `election_votes`, and `rss_feed_bookmarks`. Member eligibility requires a discoverable, enabled, non-deleted source that is also unmuted by the viewer, plus the viewer's hidden-item, topic, and hostname exclusions. The request that produced the primary does not restrict related members by search terms, follows, or community membership. Administrators retain public and personal discovery exclusions while receiving administrator embed projections.

Anonymous responses use the short public cache TTL.

## POST /api/v1/stories/:storyId/discussions

Creates a discussion post from a story, linking all item URLs and forwarding categories.
Requires `currentUserCanCreateStoryPost` authorization.

## Performance

| Endpoint                                  | Round Trips | Caching                                  | Notes                                                                                                          |
| ----------------------------------------- | ----------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET /api/v1/stories/:id                   | 2           | Entities: Valkey batch; HTTP: short anon | Fetch story metadata and a bounded indexed member page, then hydrate only selected IDs and page-local sidecars |
| POST /api/v1/stories/:storyId/discussions | 1           | None                                     | Write                                                                                                          |

## Related

- Service: [../../../services/stories/](../../../../overview/architecture/services/stories/README.md)
- Parent: [../AGENTS.md](../../../../../backend/api/AGENTS.md)
