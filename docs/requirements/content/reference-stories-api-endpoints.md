# Stories reference

[Back to Stories](stories.md)

## API Endpoints

| Method | Path                                     | Auth     | Description                             |
| ------ | ---------------------------------------- | -------- | --------------------------------------- |
| GET    | `/api/v1/stories/:id`                    | Optional | Story details + hydrated items          |
| POST   | `/api/v1/stories/:storyId/discussions`   | Required | Create story post from story            |
| POST   | `/api/v1/rss-feed-items/:id/discussions` | Required | Create link post from RSS feed item URL |
| PUT    | `/api/v1/stories/:storyId/items/:itemId` | Admin    | Add item to story (locks)               |
| DELETE | `/api/v1/stories/:storyId/items/:itemId` | Admin    | Remove item from story (locks)          |
| PUT    | `/api/v1/stories/:storyId/official`      | Admin    | Set official item (locks)               |
| PATCH  | `/api/v1/stories/:storyId`               | Admin    | Update story title                      |

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- Feed queries: [../../overview/architecture/feeds.md](../../overview/architecture/feeds.md)
- News discussions: [NEWS-DISCUSSIONS.md](NEWS-DISCUSSIONS.md)
- Source story UI and discussion model: [news-story-clusters.md](./news-story-clusters.md)
- Stories service: [../../backend/services/stories/README.md](../../../backend/services/stories/README.md)
- Story clustering system: [../../backend/queues/ai-agents/README.md](../../../backend/queues/ai-agents/README.md)
