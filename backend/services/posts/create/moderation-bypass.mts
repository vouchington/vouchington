import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Whether creation explicitly used the administrator moderation bypass. */
export async function hasPostCreationModerationBypass(postId: string): Promise<boolean> {
  const { rows } = await read<{ has_creation_moderation_bypass: boolean }>(
    sql`/* hasPostCreationModerationBypass */
      SELECT has_creation_moderation_bypass FROM posts WHERE id = ${postId}`,
  )
  return rows.at(0)?.has_creation_moderation_bypass ?? false
}
