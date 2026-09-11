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
      INSERT INTO moderation_media_reveals (moderator_id, surface, revealed_at)
      VALUES (${moderatorId}, ${surface}, now() - (${i} || ' seconds')::interval)
    `)
  }
}
