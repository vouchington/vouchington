# Lists reference

[Back to Lists](LISTS.md)

## Architecture Decision: One Generic Entity, Filtered Views

A list is a named mixed-media container. The three "kinds" (Reading/Watch/Listen) are **filtered
views over `rss_feed_items.media_type`**, not three distinct entity types. There is no `kind`
discriminator on the list row itself. This mirrors the approach in
[PODCASTS.md](./PODCASTS.md#architecture-decision-facet-not-a-new-topic-type) (facet, not type)
and avoids three schemas for what is functionally one UI pattern.

## Schema

Migration: `backend/data-stores/psql/migrations/0500-00-00-lists.sql`
Migration: `backend/data-stores/psql/migrations/0510-00-00-read-states.sql`
View: `backend/data-stores/psql/views/2026-06-28-list-items.sql`

### `list_visibility` enum

`'private' | 'unlisted' | 'public'`

- **private** (default): only the owner can view.
- **unlisted**: anyone with the URL can view (P3).
- **public**: discoverable (P3).

### `lists`

| Column          | Type                                                      | Notes                                           |
| --------------- | --------------------------------------------------------- | ----------------------------------------------- |
| `id`            | `UUID DEFAULT uuidv7() PRIMARY KEY`                       | UUIDv7 PK                                       |
| `owner_user_id` | `UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`    | List owner; cascades on user deletion           |
| `name`          | `TEXT NOT NULL`                                           | CHECK length 1–255                              |
| `description`   | `TEXT`                                                    | Optional                                        |
| `visibility`    | `list_visibility NOT NULL DEFAULT 'private'`              | Enum; flipped to public/unlisted in P3          |
| `created_at`    | `TIMESTAMPTZ` GENERATED from `uuid_extract_timestamp(id)` | Derived from UUIDv7 id                          |
| `updated_at`    | `TIMESTAMPTZ NOT NULL DEFAULT now()`                      | Trigger-maintained via `fn_update_updated_at()` |
| `removed_at`    | `TIMESTAMPTZ`                                             | Soft-delete; non-null = deleted                 |

Indexes: `(owner_user_id, id DESC) WHERE removed_at IS NULL` for sidebar/owner-index queries.

### `list_item_types` enum

`'rss_feed_item' | 'post'`

### `list_items__rss_feed_items` and `list_items__posts`

Junction tables linking lists to their items; both have `removed_at` soft-delete and a partial
unique index `(list_id, entity_id) WHERE removed_at IS NULL`.

### `view_list_items`

UNION ALL view over both junction tables, filtered `WHERE removed_at IS NULL`. Exposes:
`(id, list_id, item_type, entity_id, order_index, created_at, media_type)`.

### Read-state tables (P2)

`rss_feed_item_read_states (user_id, rss_feed_item_id, read_at)` — PK `(user_id, rss_feed_item_id)`.
`post_read_states (user_id, post_id, read_at)` — PK `(user_id, post_id)`.

No `created_at`/`updated_at` (allowlisted in schema static analysis).
