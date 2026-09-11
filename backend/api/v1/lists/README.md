# Lists API

CRUD and management endpoints for user-curated lists of RSS feed items and posts.

Mutations (`POST`/`PATCH`/`DELETE`) require a signed-in, unsuspended owner. Suspended
callers receive `403` with `ACCOUNT_SUSPENDED`. Reads stay available so a suspended
owner can still view their lists.

## Endpoints

| Method | Route                                              | Authentication | Description                                                                      |
| ------ | -------------------------------------------------- | -------------- | -------------------------------------------------------------------------------- |
| GET    | `/api/v1/lists`                                    | Required       | Paginated list of the current user's active lists                                |
| POST   | `/api/v1/lists`                                    | Required       | Create a new list; body: `{ name, description?, visibility? }`                   |
| GET    | `/api/v1/lists/contains`                           | Required       | Returns list IDs containing an entity; query: `item_type`, `entity_id`           |
| GET    | `/api/v1/lists/:id`                                | Optional       | Get a list; 404 if private and not owner                                         |
| PATCH  | `/api/v1/lists/:id`                                | Required       | Update list fields; body: `{ name?, description?, visibility? }`                 |
| DELETE | `/api/v1/lists/:id`                                | Required       | Soft-delete a list; 204 no-content                                               |
| GET    | `/api/v1/lists/:id/items`                          | Optional       | Paginated list items; optional `media_type` filter; 404 if private and not owner |
| POST   | `/api/v1/lists/:id/items/rss-feed-items`           | Required       | Add an RSS feed item; body: `{ rss_feed_item_id }`                               |
| DELETE | `/api/v1/lists/:id/items/rss-feed-items/:entityId` | Required       | Remove an RSS feed item                                                          |
| POST   | `/api/v1/lists/:id/items/posts`                    | Required       | Add a post; body: `{ post_id }`                                                  |
| DELETE | `/api/v1/lists/:id/items/posts/:entityId`          | Required       | Remove a post                                                                    |

## Performance

| Endpoint                                     | Round trips                   | Cache | Cache-Control        |
| -------------------------------------------- | ----------------------------- | ----- | -------------------- |
| GET `/api/v1/lists`                          | 1 (searchUserLists)           | None  | None (authenticated) |
| POST `/api/v1/lists`                         | 1 (createList)                | None  | None                 |
| GET `/api/v1/lists/contains`                 | 1 (getListsContainingEntity)  | None  | None (authenticated) |
| GET `/api/v1/lists/:id`                      | 1 (getList)                   | None  | None                 |
| PATCH `/api/v1/lists/:id`                    | 2 (getList + updateList)      | None  | None                 |
| DELETE `/api/v1/lists/:id`                   | 2 (getList + softDeleteList)  | None  | None                 |
| GET `/api/v1/lists/:id/items`                | 2 (getList + searchListItems) | None  | None                 |
| POST `/api/v1/lists/:id/items/*`             | 2 (getList + addListItem)     | None  | None                 |
| DELETE `/api/v1/lists/:id/items/*/:entityId` | 2 (getList + removeListItem)  | None  | None                 |

## Related

- Service: [../../../services/lists/README.md](../../../services/lists/README.md)
- Parent: [../../CLAUDE.md](../../CLAUDE.md)
