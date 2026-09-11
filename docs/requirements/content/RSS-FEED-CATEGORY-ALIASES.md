# RSS Feed Category Aliases

Admin tool for triaging unmapped RSS feed item categories and assigning them to topics.

## Overview

The RSS feed category triage tool enables admins to:

- List category strings from `rss_feed_item_categories` where `topic_id IS NULL` (unmapped)
- Reject categories to hide them from the pending queue permanently
- Unreject previously rejected categories to bring them back to pending
- Assign a category string as an alias for an existing topic (backfills existing rows)
- Create a new topic and assign the category string as an alias in one step
- Filter the queue by status: `pending`, `rejected`, or `all` (default: `pending`)

## Data Model

### `rss_feed_item_categories`

Stores category strings extracted from RSS feed items alongside a resolved `topic_id`. An RSS ingest
replaces the item's normalized category snapshot, so an empty category array removes existing rows.

| Column             | Type   | Description                                                  |
| ------------------ | ------ | ------------------------------------------------------------ |
| `category_text`    | `text` | Raw category string from the feed (part of composite PK)     |
| `rss_feed_item_id` | `uuid` | FK to the RSS feed item                                      |
| `topic_id`         | `uuid` | FK to `topics`; `NULL` when the category has not been mapped |

Rows with `topic_id IS NULL` are "unmapped" and appear in the admin triage queue.

### `rss_feed_item_category_rejections`

Records categories that an admin has explicitly rejected (hidden from the pending queue).

| Column          | Type          | Description                          |
| --------------- | ------------- | ------------------------------------ |
| `category_text` | `text PK`     | The rejected category string         |
| `created_at`    | `timestamptz` | When the rejection was recorded      |
| `created_by_id` | `uuid`        | FK to the admin user who rejected it |

### Topic Resolution

When a category is assigned to a topic (via assign-alias or create-topic), the service:

1. Inserts a `topic_aliases` row linking `category_text` to the topic.
2. Calls `backfillCategoriesForTopicAliases` to set `topic_id` on all existing `rss_feed_item_categories` rows with that `category_text`.

Future RSS feed items whose category matches any known alias are mapped automatically on ingest.

## Actions

### Reject

Hides the category from the `pending` queue without mapping it to a topic.

- Creates a row in `rss_feed_item_category_rejections`.
- API: `POST /api/v1/rss-feed-categories/rejections` with `{ category_text }`.

### Unreject

Removes a rejection so the category returns to `pending`.

- Deletes the row from `rss_feed_item_category_rejections`.
- API: `DELETE /api/v1/rss-feed-categories/rejections` with `{ category_text }`.

### Assign as Topic Alias

Maps the category string to an existing topic.

- Adds a `topic_aliases` entry and backfills `rss_feed_item_categories.topic_id`.
- API: `POST /api/v1/rss-feed-categories/assignments` with `{ category_text, topic_id }`.

### Create New Topic

Opens the topic creation form prefilled with the category string; the admin creates the topic
and the resulting alias mapping is handled through the normal create-topic flow.

- Frontend: navigates to `/topics/create?name=<category>&slug=<slugified-category>`.
- No dedicated API endpoint — topic creation posts to `POST /api/v1/topics`.

## Status Filter

| Value      | Shows                                                            |
| ---------- | ---------------------------------------------------------------- |
| `pending`  | Unmapped categories (`topic_id IS NULL`) not in rejections table |
| `rejected` | Categories present in `rss_feed_item_category_rejections`        |
| `all`      | All unmapped categories regardless of rejection status           |

Default filter: `pending`.

## Authorization

All endpoints (`GET /api/v1/rss-feed-categories`, `POST/DELETE /api/v1/rss-feed-categories/rejections`, `POST /api/v1/rss-feed-categories/assignments`) require the `administrator` role. The admin page `/rss-feed-categories` is gated by a route-group admin layout.

## Related

- API reference: [`backend/api/v1/admin/rss-feed-categories/`](../../../backend/api/v1/admin/rss-feed-categories)
- RSS feed items service: [`backend/services/rss-feed-items/README.md`](../../../backend/services/rss-feed-items/README.md)
- Topic aliases: [`backend/services/topics/README.md`](../../../backend/services/topics)
- Schema: [`backend/data-stores/psql/README.md`](../../../backend/data-stores/psql/README.md)
