# Curated Aside Items API

Public read endpoint for admin-curated sidebar content.

## Endpoints

| Method | Route                               | Authentication | Description                |
| ------ | ----------------------------------- | -------------- | -------------------------- |
| GET    | `/api/v1/curated-aside-items`       | Optional       | List curated items by type |
| POST   | `/api/v1/curated-aside-items`       | Admin          | Add or upsert one item     |
| DELETE | `/api/v1/curated-aside-items/:id`   | Admin          | Soft-delete one item       |
| PUT    | `/api/v1/curated-aside-items/order` | Admin          | Persist explicit ordering  |

## GET /api/v1/curated-aside-items

Returns active curated items for a given aside type, ordered by `position`. Each item includes hydrated `entity_data` suitable for UI labels; unresolved legacy rows return `entity_data: null` instead of exposing raw UUIDs as display text.

Query parameters:

- `type` — **required** — aside type: `topic`, `source`, or `community`

Response: `{ curated_aside_items: CuratedAsideItem[] }`

Cached (short TTL) for unauthenticated users.

## POST /api/v1/curated-aside-items

Adds or replaces an active curated item. The request body is JSON:

- `aside_type` — **required** — `topic`, `source`, or `community`
- `entity_id` — **required** — UUID of an existing active entity for the chosen type
- `position` — optional integer from `0` to `32767`; omitted positions append to the end of the type list

The service validates that the entity exists and matches the aside type before writing.

## Performance

| Endpoint                         | Round Trips | Caching          | Notes                                       |
| -------------------------------- | ----------- | ---------------- | ------------------------------------------- |
| GET /api/v1/curated-aside-items  | 1           | HTTP: short anon | Direct DB list with label hydration joins   |
| POST /api/v1/curated-aside-items | 1 tx        | none             | Validates entity and appends when unordered |

## Related

- Service: [../../../services/curated-aside-items/README.md](../../../services/curated-aside-items/README.md)
- Mutations are registered on this resource route and require the `administrator` role.
