# Curated Aside Items Service

Admin-managed list of curated content items (topics, sources, communities) displayed in sidebar aside widgets.

## Data model

`curated_aside_items` — one row per curated entity:

- `topic_id`, `rss_feed_id`, `community_id` — concrete target FKs; exactly one is set and target deletion cascades to the curated row
- `aside_type`, `entity_id` — generated compatibility fields that preserve the API discriminator and target UUID
- `position` — display order within each `aside_type` (lower = first)
- `created_by_id` — admin user who added the item; becomes `NULL` if that user is deleted
- `deleted_at` — soft-delete timestamp; `NULL` means active

## Functions

- `listCuratedItems(asideType)` → active items ordered by `position` with hydrated `entity_data`
- `createCuratedItem(currentUser, asideType, entityId, position?)` → validates the referenced entity, inserts or upserts a curated item, and appends when `position` is omitted (admin only)
- `deleteCuratedItem(currentUser, id)` → soft-deletes an item (admin only)
- `reorderCuratedItems(currentUser, asideType, itemIds)` → updates `position` for each item (admin only)
- `currentUserCanManageCuratedAsides(currentUser)` → authorization check

## UI contract

Admin UI must display `entity_data` labels and must not ask users to type raw IDs or UUIDs. Use autocomplete selection for topics, sources, and communities; use reorder APIs from drag/drop or up/down controls instead of exposing a position input.
