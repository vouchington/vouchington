import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { Conversation } from './types.mts'

export async function createConversation(createdById: string, title = ''): Promise<Conversation> {
  const { rows } = await write<Conversation>(sql`/* createConversation */
      INSERT INTO conversations (created_by_id, title)
      VALUES (${createdById}, ${title})
      RETURNING id, channel_type, title, created_at, created_by_id, updated_at,
        updated_by_id, deleted_at, deleted_by_id
    `)
  return rows[0]!
}
