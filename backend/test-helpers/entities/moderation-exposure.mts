import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Insert N distinct media-reveal rows for the given moderator, all within the current
 * 60-minute exposure window. Used to simulate a moderator approaching or crossing
 * the exposure-break threshold without going through the UI.
 */
export async function insertTestModerationMediaReveals(
  moderatorId: string,
  count: number,
  surface: 'mod_queue' | 'review_queue' | 'reports' | 'post_page' = 'mod_queue',
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await write(sql`/* insertTestModerationMediaReveals */
      INSERT INTO moderation_media_reveals (moderator_user_id, surface, revealed_at)
      VALUES (${moderatorId}, ${surface}, now() - (${i} || ' seconds')::interval)
    `)
  }
}

/**
 * Bulk-insert `total` distinct reveals in one statement. The oldest `oldestCount` are 5 minutes
 * old and the rest 1 minute old, each 1ms apart. Returns the revealed_at of the `oldestCount`-th
 * oldest row, which is the row the exposure cooldown is anchored to.
 */
export async function seedTestModerationMediaRevealsOldestFirst(
  moderatorId: string,
  total: number,
  oldestCount: number,
): Promise<Date> {
  const { rows } = await write<{
    thresholdAt: Date
  }>(sql`/* seedTestModerationMediaRevealsOldestFirst */
    WITH inserted AS (
      INSERT INTO moderation_media_reveals (moderator_user_id, surface, revealed_at)
      SELECT
        ${moderatorId},
        'mod_queue',
        CASE
          WHEN n <= ${oldestCount}
            THEN now() - interval '5 minutes' + n * interval '1 millisecond'
          ELSE now() - interval '1 minute' + n * interval '1 millisecond'
        END
      FROM generate_series(1, ${total}) AS n
      RETURNING revealed_at
    )
    SELECT max(revealed_at) AS "thresholdAt"
    FROM inserted
    WHERE revealed_at < now() - interval '2 minutes'
  `)
  return rows[0]!.thresholdAt
}
