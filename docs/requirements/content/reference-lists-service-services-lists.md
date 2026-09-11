# Lists reference

[Back to Lists](LISTS.md)

## Service: `@services/lists`

`backend/services/lists/`

| Function                   | Description                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `createList`               | Insert a new `lists` row; owner = caller                                            |
| `getList`                  | Fetch by id (read pool)                                                             |
| `getListForWrite`          | Fetch by id (write pool, used on mutating paths to avoid replica lag)               |
| `updateList`               | Rename / change description or visibility                                           |
| `softDeleteList`           | Set `removed_at = now()`                                                            |
| `searchUserLists`          | Paginated list of owner's lists (cursor = UUIDv7 id)                                |
| `addListItem`              | Insert into the appropriate junction table; idempotent (23505 → reuse existing row) |
| `removeListItem`           | Set `removed_at = now()` on the junction row                                        |
| `searchListItems`          | Paginated items from `view_list_items`; optional `mediaType` and `read` filters     |
| `getListsContainingEntity` | Returns list IDs for a given owner × item_type × entity_id (Add-to-List UI)         |
| `importCommunityList`      | Bulk-copies a community's pinned items into a personal list (P4)                    |
| `currentUserCanViewList`   | Owner always; others only when `visibility != 'private'` (P3 gate)                  |
| `currentUserCanManageList` | Owner only                                                                          |
