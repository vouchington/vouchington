import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type PlaybackPositionRow = {
  position_seconds: number
  completed_at: string | null
}

/**
 * Upserts a user's playback position for a podcast episode.
 * Called on every periodic position update from the web or Swift client.
 * completed_at reflects the latest write: set when `completed` is true, cleared otherwise.
 */
export async function upsertPlaybackPosition(
  currentUserId: string,
  rssFeedItemId: string,
  {
    positionSeconds,
    completed,
  }: {
    positionSeconds: number
    completed: boolean
  },
): Promise<void> {
  await write(
    sql`/* upsertPlaybackPosition */
      INSERT INTO podcast_playback_positions (user_id, rss_feed_item_id, position_seconds, completed_at)
      VALUES (
        ${currentUserId},
        ${rssFeedItemId},
        ${positionSeconds},
        CASE WHEN ${completed}::boolean THEN CURRENT_TIMESTAMP ELSE NULL END
      )
      ON CONFLICT (user_id, rss_feed_item_id) DO UPDATE SET
        position_seconds = EXCLUDED.position_seconds,
        completed_at = CASE
          WHEN ${completed}::boolean THEN CURRENT_TIMESTAMP
          ELSE NULL
        END,
        updated_at = CURRENT_TIMESTAMP
    `,
  )
}

/**
 * Returns the saved playback position for a user + episode pair, or null if none exists.
 * Uses the read-replica pool (no writes).
 */
export async function getPlaybackPosition(
  currentUserId: string,
  rssFeedItemId: string,
): Promise<PlaybackPositionRow | null> {
  const { rows } = await read(
    sql`/* getPlaybackPosition */
      SELECT position_seconds, completed_at
      FROM podcast_playback_positions
      WHERE user_id = ${currentUserId}
        AND rss_feed_item_id = ${rssFeedItemId}
    `,
  )
  if (rows.length === 0) return null
  const row = rows[0] as { position_seconds: number; completed_at: string | null }
  return {
    position_seconds: row.position_seconds,
    completed_at: row.completed_at,
  }
}
