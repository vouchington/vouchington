# List Anatomy

> A user-curated named collection of `rss_feed_items` and `posts`. Lists are personal (owner-only
> by default) and expose filtered views by `media_type` — All, Reading, Watch, and Listen.

## See Also

- [Entity × Action Matrix — list](../ENTITY-ACTION-MATRIX.md)
- [Entity × Lifecycle Flow Matrix — list](../ENTITY-LIFECYCLE-MATRIX.md)
- [Lists requirements](../content/LISTS.md)

## Data Model

### `lists`

| Field                                        | Notes                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                                         | UUIDv7 PK; `created_at` derived from `uuid_extract_timestamp`                                           |
| `owner_user_id`                              | FK → `users.id`; cascades on delete                                                                     |
| `name`                                       | Text, 1–255 chars                                                                                       |
| `description`                                | Optional text                                                                                           |
| `visibility`                                 | `'private' \| 'unlisted' \| 'public'`; default `'private'`                                              |
| `updated_at`                                 | Trigger-maintained                                                                                      |
| `removed_at`                                 | Soft-delete; non-null = deleted                                                                         |
| `created_via`, `created_via_oauth_client_id` | Immutable creation channel and OAuth client; see [Content provenance](../content/content-provenance.md) |

### `list_items__rss_feed_items` / `list_items__posts`

Junction tables. Both have a partial unique index on `(list_id, entity_id) WHERE removed_at IS NULL`
and cursor-pagination index on `(list_id, id DESC) WHERE removed_at IS NULL`.

### `rss_feed_item_read_states` / `post_read_states`

Append-only read-tracking tables with PK `(user_id, entity_id)`.

### `view_list_items`

UNION ALL view over both junction tables:
`(id, list_id, item_type, entity_id, order_index, created_at, media_type)`.

## Lifecycle States

| State        | Condition                | Notes                          |
| ------------ | ------------------------ | ------------------------------ |
| Active       | `removed_at IS NULL`     | Normal state; visible to owner |
| Soft-deleted | `removed_at IS NOT NULL` | Hidden; no hard-delete         |

List items (junction rows) follow the same pattern: `removed_at` = removed from list.

## Rendered Surfaces

| Surface                 | Route / Component                                                |
| ----------------------- | ---------------------------------------------------------------- |
| Owner index             | `/my/lists`                                                      |
| List detail             | `/list/[id]` with All/Reading/Watch/Listen tabs                  |
| Canonical list-item row | `ListItemRow` (`web/components/lists/list-item-row.tsx`)         |
| Sidebar group           | `ListsSidebarGroup` (live fetch, `lists:created` event)          |
| Add-to-list dialog      | `AddToListMenuItem` → checklist dialog with `getListsContaining` |
| Import from community   | `ListImportCommunityDialog`                                      |

## Actions

| Action           | Who                               | Endpoint / Function                         |
| ---------------- | --------------------------------- | ------------------------------------------- |
| Create           | Signed-in                         | `POST /api/v1/lists`                        |
| View             | Owner (P1); unlisted/public in P3 | `GET /api/v1/lists/:id`                     |
| Rename/Edit      | Owner                             | `PATCH /api/v1/lists/:id`                   |
| Delete           | Owner                             | `DELETE /api/v1/lists/:id`                  |
| Add item         | Owner                             | `POST /api/v1/lists/:id/items/{type}`       |
| Remove item      | Owner                             | `DELETE /api/v1/lists/:id/items/{type}/:id` |
| Filter by tab    | Viewer                            | `?media_type=article\|video\|audio`         |
| Filter by read   | Owner                             | `?read=true\|false` (requires auth)         |
| Import community | Owner                             | `POST /api/v1/lists/:id/import`             |
| Mark read/unread | Signed-in                         | `PUT/DELETE /api/v1/{type}/:id/read`        |
