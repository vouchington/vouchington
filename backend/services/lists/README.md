# @services/lists

User-curated named collections of RSS feed items and posts.

## Key exports

- `createList(currentUserId, { name, description?, visibility? })` — create a new list
- `getList(listId)` — fetch a list by ID (returns soft-deleted lists; caller must check visibility)
- `updateList(currentUserId, listId, { name?, description?, visibility? })` — update list fields
- `softDeleteList(currentUserId, listId)` — soft-delete a list (sets removed_at)
- `searchUserLists(ownerUserId, { limit?, after? })` — paginated list of a user's active lists
- `addListItem(listId, itemType, entityId)` — idempotent add of an item to a list
- `removeListItem(listId, itemType, entityId)` — soft-remove an item from a list
- `searchListItems(listId, { limit?, after?, mediaType? })` — paginated list items via view_list_items
- `getListsContainingEntity(ownerUserId, itemType, entityId)` — list IDs containing an entity
- `currentUserCanViewList(currentUserId, list)` — visibility check for read access
- `currentUserCanManageList(currentUserId, list)` — ownership check for write access

Mutation routes apply `assertNotSuspended` before these ownership checks. See the
cross-file contract in [authorization.mts](./authorization.mts).

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Schema: [../../data-stores/psql/migrations/0500-00-00-lists.sql](../../data-stores/psql/migrations/0500-00-00-lists.sql)
- View: [../../data-stores/psql/views/2026-06-28-list-items.sql](../../data-stores/psql/views/2026-06-28-list-items.sql)
- API routes: [../../api/v1/lists/README.md](../../api/v1/lists/README.md)
