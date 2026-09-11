import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'

export async function deleteCrmNote(
  currentUser: PrivateUser,
  contactId: string,
  noteId: string,
): Promise<void> {
  assert(currentUser.roles.includes('administrator'), 403, 'Forbidden')

  const conversationId = await getCrmConversationIdByContactId(contactId)
  assert(conversationId, 404, 'Note not found')

  const { rowCount } = await write(sql`/* deleteCrmNote */
    UPDATE conversation_messages
    SET deleted_at = COALESCE(deleted_at, NOW()),
        updated_at = CURRENT_TIMESTAMP
    WHERE conversation_id = ${conversationId}
      AND id = ${noteId}
      AND kind = 'note'
      AND deleted_at IS NULL
  `)
  assert(rowCount, 404, 'Note not found')
}

async function getCrmConversationIdByContactId(contactId: string): Promise<string | null> {
  const { rows } = await read(sql`/* getCrmConversationIdByContactId */
    SELECT conversation_id
    FROM conversation_participants
    WHERE crm_contact_id = ${contactId}
      AND removed_at IS NULL
    LIMIT 1
  `)
  return (rows[0] as { conversation_id: string } | undefined)?.conversation_id ?? null
}
