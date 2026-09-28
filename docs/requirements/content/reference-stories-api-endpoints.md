# Stories reference

[Back to Stories](stories.md)

## API Endpoints

| Method | Path                                     | Auth     | Description                             |
| ------ | ---------------------------------------- | -------- | --------------------------------------- |
| GET    | `/api/v1/stories/:id`                    | Optional | Story details + bounded member page     |
| POST   | `/api/v1/stories/:storyId/discussions`   | Required | Create story post from story            |
| POST   | `/api/v1/rss-feed-items/:id/discussions` | Required | Create link post from RSS feed item URL |
| PUT    | `/api/v1/stories/:storyId/items/:itemId` | Admin    | Add item to story (locks)               |
| DELETE | `/api/v1/stories/:storyId/items/:itemId` | Admin    | Remove item from story (locks)          |
| PUT    | `/api/v1/stories/:storyId/official`      | Admin    | Set official item (locks)               |
| PATCH  | `/api/v1/stories/:storyId`               | Admin    | Update story title                      |

`GET /api/v1/stories/:id` returns story metadata without `item_count`, at most 25 hydrated eligible members ordered by item ID descending, and `item_ids`/`page_info`. `limit` defaults to 25; `after` is an opaque cursor; `exclude_item_id` removes the primary before pagination and is repeated on continuation. Tokens are scoped to story, viewer, public/administrator access, and exclusion, but not page size or preview configuration. Page-local item/election/embed/thumbnail/content HTML, visible discussion posts and metrics, and bookmark/vote/feed-bookmark sidecars use the same shapes as the feed. The viewer sidecars are empty maps for anonymous requests. The selector applies discoverable-source and viewer visibility rules, not the request's search, follow, or community filters.

## Related

- [Web rules](../../../web/AGENTS.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/AGENTS.md) — service, API, and data conventions

- Feed queries: [../../overview/architecture/feeds.md](../../overview/architecture/feeds.md)
- News discussions: [NEWS-DISCUSSIONS.md](NEWS-DISCUSSIONS.md)
- Source story UI and discussion model: [news-story-clusters.md](news-story-clusters.md)
- Stories service: [../../backend/services/stories/README.md](../../overview/architecture/services/stories/README.md)
- Story clustering system: [../../backend/queues/ai-agents/README.md](../../overview/architecture/queues/ai-agents/README.md)
