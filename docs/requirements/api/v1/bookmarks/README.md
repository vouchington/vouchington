# Bookmarks API

Source entrypoint: [backend/api/v1/bookmarks/README.md](../../../../../backend/api/v1/bookmarks/README.md)

Manage bookmarks for entities (posts, topics, RSS feed items, users).

## Endpoints

| Method | Route                                                | Authentication | Description                 |
| ------ | ---------------------------------------------------- | -------------- | --------------------------- |
| GET    | `/api/v1/bookmarks/:entityType/:entityId`            | Required       | Get bookmarks for an entity |
| PUT    | `/api/v1/bookmarks/:entityType/:entityId/:predicate` | Required       | Bookmark an entity          |
| DELETE | `/api/v1/bookmarks/:entityType/:entityId/:predicate` | Required       | Remove a bookmark           |

## GET /api/v1/bookmarks/:entityType/:entityId

Returns all bookmark relations the current user has for the given entity.

## PUT /api/v1/bookmarks/:entityType/:entityId/:predicate

Creates a bookmark relation for a target the caller can view using that entity type's detail-route
authorization. Missing or invisible targets return `404 Entity not found`. Suspended users receive
the standard account-suspended error. Returns `{ bookmark }` on success.

## DELETE /api/v1/bookmarks/:entityType/:entityId/:predicate

Removes the caller's bookmark relation and returns `204 No Content`. The route does not require the
target to remain visible, so users can clean up bookmarks after a target becomes private, hidden,
or removed. Suspended users receive the standard account-suspended error.

## Performance

| Endpoint                                                  | Round Trips | Caching      | Notes        |
| --------------------------------------------------------- | ----------- | ------------ | ------------ |
| GET /api/v1/bookmarks/:entityType/:entityId               | 2           | None         | Auth, query  |
| PUT /api/v1/bookmarks/:entityType/:entityId/:predicate    | 2           | None (write) | Auth, upsert |
| DELETE /api/v1/bookmarks/:entityType/:entityId/:predicate | 2           | None (write) | Auth, delete |

## Related

- Service: [../../services/bookmarks/](../../../../overview/architecture/services/bookmarks/README.md)
- Entity relations: [../entity-relations/README.md](../entity-relations/README.md)
- Parent: [../AGENTS.md](../../../../../backend/api/AGENTS.md)
