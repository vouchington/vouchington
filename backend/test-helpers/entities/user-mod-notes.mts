import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertTestUserModNote(options: {
  targetUserId: string
  authorUserId: string
  body: string
  communityId?: string | null
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`
    INSERT INTO user_mod_notes (target_user_id, author_user_id, community_id, body)
    VALUES (
      ${options.targetUserId},
      ${options.authorUserId},
      ${options.communityId === undefined ? null : options.communityId},
      ${options.body}
    )
    RETURNING id
  `)
  return rows[0]!.id
}
