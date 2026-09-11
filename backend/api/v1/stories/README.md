# Stories API

Story detail and discussion creation for grouped RSS feed items.

## Endpoints

| Method | Route                                  | Authentication | Description                   |
| ------ | -------------------------------------- | -------------- | ----------------------------- |
| GET    | `/api/v1/stories/:id`                  | Optional       | Get story with hydrated items |
| POST   | `/api/v1/stories/:storyId/discussions` | Required       | Create a discussion post      |

## GET /api/v1/stories/:id

Returns the story with its RSS feed items and elections. Response is streamed and includes:
`story`, `rss_feed_items`, `rss_feed_item_embeds`, `rss_feed_item_elections`, `item_ids`. The embed sidecar is keyed by item ID and includes backend-selected display text plus authorized image/player projections; complete raw crawl metadata and oEmbed provenance are administrator-only.

Cached (short TTL) for unauthenticated users.

## POST /api/v1/stories/:storyId/discussions

Creates a discussion post from a story, linking all item URLs and forwarding categories.
Requires `currentUserCanCreateStoryPost` authorization.

## Performance

| Endpoint                                  | Round Trips | Caching                                  | Notes                                                                             |
| ----------------------------------------- | ----------- | ---------------------------------------- | --------------------------------------------------------------------------------- |
| GET /api/v1/stories/:id                   | 2           | Entities: Valkey batch; HTTP: short anon | Fetch story + item IDs → parallel streaming (items, item-keyed embeds, elections) |
| POST /api/v1/stories/:storyId/discussions | 1           | None                                     | Write                                                                             |

## Related

- Service: [../../../services/stories/](../../../services/stories/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
