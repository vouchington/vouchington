# podcast-playback-positions

Service for persisting and reading per-user podcast episode playback positions.

## Data model

`podcast_playback_positions` — composite PK `(user_id, rss_feed_item_id)`:

| Column             | Type        | Notes                                             |
| ------------------ | ----------- | ------------------------------------------------- |
| `user_id`          | UUID FK     | References `users(id) ON DELETE CASCADE`          |
| `rss_feed_item_id` | UUID FK     | References `rss_feed_items(id) ON DELETE CASCADE` |
| `position_seconds` | FLOAT       | Current playback offset in seconds                |
| `completed_at`     | TIMESTAMPTZ | Set once when episode ends; NULL if not yet done  |
| `updated_at`       | TIMESTAMPTZ | Auto-updated via `fn_update_updated_at()` trigger |

## Functions

### `upsertPlaybackPosition(currentUserId, rssFeedItemId, { positionSeconds, completed })`

Upserts the playback position. Called on every ~10–15s throttled tick from the global player, and on `pause`, `ended`, and `pagehide`. `completed_at` is only set when `completed: true`; it is never cleared on subsequent calls.

### `getPlaybackPosition(currentUserId, rssFeedItemId)`

Single-row read from the read replica. Returns `{ position_seconds, completed_at } | null`. Returns `null` when no row exists (episode never played by this user).

## Usage

```ts
import { upsertPlaybackPosition, getPlaybackPosition } from '@services/podcast-playback-positions'

// write (called from PUT route)
await upsertPlaybackPosition(userId, episodeId, { positionSeconds: 42.5, completed: false })

// read at resume (called from GET route)
const pos = await getPlaybackPosition(userId, episodeId)
// pos?.position_seconds → seek target; pos?.completed_at → restart from 0 if set
```

## Related

- Migration: `backend/data-stores/psql/migrations/0490-00-00-podcast-playback-positions.sql`
- Route: `backend/api/v1/podcast-episodes/`
- Podcast requirements: `docs/requirements/content/PODCASTS.md`
