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

Creates a bookmark relation. Returns `{ bookmark }`.

## DELETE /api/v1/bookmarks/:entityType/:entityId/:predicate

Removes a bookmark relation. Returns `204 No Content`.

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
