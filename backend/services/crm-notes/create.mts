import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { CrmNote, CreateCrmNoteInput } from './types.mts'
import { getCrmContact } from '@services/crm-contacts'
import { getOrCreateCrmConversation } from '@services/crm-messages/send'

export async function createCrmNote(
  currentUser: PrivateUser,
  input: CreateCrmNoteInput,
): Promise<CrmNote> {
  assert(currentUser.roles.includes('administrator'), 403, 'Forbidden')
  assert(input.body?.trim(), 422, 'body is required')
  assert(input.body.trim().length <= 10000, 422, 'body must be at most 10000 characters')

  const contact = await getCrmContact(input.contact_id)
  assert(contact, 404, 'Contact not found')
  const conversationId = await getOrCreateCrmConversation(
    currentUser,
    input.contact_id,
    contact.name,
  )

  const { rows } = await write(sql`/* createCrmNote */
    INSERT INTO conversation_messages (
      conversation_id, created_by_id, kind, direction, body_text
    )
    VALUES (${conversationId}, ${currentUser.id}, 'note', 'outbound', ${input.body.trim()})
    RETURNING
      id,
      conversation_id,
      ${input.contact_id}::UUID AS contact_id,
      body_text AS body,
      created_by_id,
      deleted_at,
      created_at,
      updated_at,
      'crm_note' AS __entity_type
  `)

  return rows[0] as CrmNote
}
