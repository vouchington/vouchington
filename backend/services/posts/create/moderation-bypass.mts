import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Whether creation explicitly used the administrator moderation bypass. */
export async function hasPostCreationModerationBypass(postId: string): Promise<boolean> {
  const { rows } = await write<{ is_creation_moderation_bypass: boolean }>(
    sql`/* hasPostCreationModerationBypass */
      SELECT EXISTS (
        SELECT 1 FROM post_clearance_changes
        WHERE post_id = ${postId} AND is_creation_moderation_bypass
      ) AS is_creation_moderation_bypass`,
  )
  return rows.at(0)?.is_creation_moderation_bypass ?? false
}
