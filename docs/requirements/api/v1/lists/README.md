# Lists API

Source entrypoint: [backend/api/v1/lists/README.md](../../../../../backend/api/v1/lists/README.md)

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

## MCP

The `create_list`, `update_list`, `delete_list`, `add_list_item`, and `remove_list_item` MCP tools
run the same list commands and ownership checks as the routes above. They need the `lists:read` and
`lists:write` scopes and a Plus plan. `POST /api/v1/lists/:id/import` has no MCP tool. See
[Bookmark and List Write Tools](../../../../overview/architecture/agent-tools/bookmark-list-write-tools.md).

The `get_my_lists`, `get_list` and `get_list_items` MCP tools read the same lists with the
`lists:read` scope. A private list is returned only to its owner and only when the credential
holds `post-relations.owned-private:write`; every other denial is the same `List not found`. See
[Hostname, List and User Read Tools](../../../../overview/architecture/agent-tools/hostname-list-user-read-tools.md).

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

- Service: [../../../services/lists/README.md](../../../../overview/architecture/services/lists/README.md)
- Parent: [../../AGENTS.md](../../../../../backend/api/AGENTS.md)
