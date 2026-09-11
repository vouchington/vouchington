import type { CrmNote } from '@voucha/types/entities/crm-contact'
import { beginTransaction, write } from '@data-stores/psql'
import { lockTestCrmContact } from './crm-locks.mts'
import sql from 'sql-template-strings'

type InsertTestCrmNoteOptions = {
  contactId: string
  body?: string
  createdById: string
}

export async function insertTestCrmNote(options: InsertTestCrmNoteOptions): Promise<CrmNote> {
  const suffix = Math.random().toString(36).slice(2, 10)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await lockTestCrmContact(options.contactId, query)
    const conversationRows = await write(
      sql`/* insertTestCrmNote:getConversation */
        SELECT c.id
        FROM conversations c
        JOIN conversation_participants cp ON cp.conversation_id = c.id
        WHERE c.channel_type = 'crm'
          AND cp.crm_contact_id = ${options.contactId}
          AND cp.removed_at IS NULL
        LIMIT 1
      `,
      { query },
    )

    let conversationId = (conversationRows.rows[0] as { id: string } | undefined)?.id
    if (!conversationId) {
      const insertedConversation = await write(
        sql`/* insertTestCrmNote:createConversation */
          INSERT INTO conversations (channel_type, title, created_by_id)
          VALUES ('crm', 'CRM notes', ${options.createdById})
          RETURNING id
        `,
        { query },
      )
      conversationId = insertedConversation.rows[0].id as string
      await write(
        sql`/* insertTestCrmNote:addContactParticipant */
          INSERT INTO conversation_participants (conversation_id, crm_contact_id, role)
          VALUES (${conversationId}, ${options.contactId}, 'owner')
        `,
        { query },
      )
    }

    const { rows } = await write(
      sql`/* insertTestCrmNote */
        INSERT INTO conversation_messages (conversation_id, created_by_id, kind, direction, body_text)
        VALUES (${conversationId}, ${options.createdById}, 'note', 'outbound', ${options.body ?? `Test note body ${suffix}`})
        RETURNING
          id,
          conversation_id,
          ${options.contactId}::UUID AS contact_id,
          body_text AS body,
          created_by_id,
          deleted_at,
          created_at,
          updated_at,
          'crm_note' AS __entity_type
      `,
      { query },
    )
    const result = rows[0] as CrmNote
    await transaction.commit()
    return result
  }
}
