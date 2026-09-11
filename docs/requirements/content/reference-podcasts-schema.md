# Podcasts reference

[Back to Podcasts](PODCASTS.md)

## Schema

Migration: `backend/data-stores/psql/migrations/0480-00-00-podcasts.sql`

### `rss_feed_categories`

Feed-level Apple iTunes categories. Mirrors item-level `rss_feed_item_categories`.

| Column          | Type        | Notes                                            |
| --------------- | ----------- | ------------------------------------------------ |
| `rss_feed_id`   | UUID FK     | References `rss_feeds ON DELETE CASCADE`         |
| `category_text` | TEXT        | Normalized (trim + lowercase). PK with feed_id.  |
| `topic_id`      | UUID FK     | Optional topic mapping; SET NULL on topic delete |
| `created_at`    | TIMESTAMPTZ |                                                  |
| `updated_at`    | TIMESTAMPTZ |                                                  |

Indexes: `topic_id`, `LOWER(category_text)` for the `/podcasts/[category]` hub filter.

### `podcast_shows`

1:1 extension table for `rss_feeds` rows with `feed_type='podcast'`. Only populated when
the feed has `<itunes:…>` namespace data.

| Column               | Type                   | Notes                                             |
| -------------------- | ---------------------- | ------------------------------------------------- |
| `rss_feed_id`        | UUID PK                | FK → `rss_feeds ON DELETE CASCADE`                |
| `itunes_author`      | TEXT                   | `<itunes:author>`; max 255 chars                  |
| `itunes_owner_name`  | TEXT                   | `<itunes:owner><itunes:name>`                     |
| `itunes_owner_email` | TEXT                   | `<itunes:owner><itunes:email>`                    |
| `cover_art_url`      | TEXT                   | Raw `<itunes:image href>`. Max 2048 chars.        |
| `is_explicit`        | BOOLEAN                | `<itunes:explicit>` (`yes`/`true` → `TRUE`)       |
| `itunes_type`        | `podcast_itunes_types` | Named enum (`episodic`, `serial`); NULL if absent |
| `updated_at`         | TIMESTAMPTZ            |                                                   |

`cover_art_url` stores the **raw** URL from the feed. It is proxied to `/sideload/` at
API-response time via `buildSideloadImageUrl`. Do not persist or serve the raw URL
directly to the client.
