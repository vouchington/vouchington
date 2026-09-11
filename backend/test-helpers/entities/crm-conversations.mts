import type { CrmThread, CrmMessage } from '@voucha/types/entities/crm-contact'
import { beginTransaction, write } from '@data-stores/psql'
import { lockTestCrmContact } from './crm-locks.mts'
import sql from 'sql-template-strings'

type InsertTestCrmThreadOptions = {
  contactId: string
  subject?: string
  createdById: string
}
export async function insertTestCrmThread(options: InsertTestCrmThreadOptions): Promise<CrmThread> {
  const suffix = Math.random().toString(36).slice(2, 10)
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await lockTestCrmContact(options.contactId, query)
    const conversationRows = await write(
      sql`/* insertTestCrmThread:getConversation */
        SELECT c.id, c.title, c.created_by_id, c.created_at, c.updated_at
        FROM conversations c
        JOIN conversation_participants cp ON cp.conversation_id = c.id
        WHERE c.channel_type = 'crm'
          AND cp.crm_contact_id = ${options.contactId}
          AND cp.removed_at IS NULL
        LIMIT 1
      `,
      { query },
    )

    let conversation = conversationRows.rows[0] as
      | { created_at: Date; created_by_id: string; id: string; title: string; updated_at: Date }
      | undefined

    if (!conversation) {
      const insertedConversation = await write(
        sql`/* insertTestCrmThread:createConversation */
          INSERT INTO conversations (channel_type, title, created_by_id)
          VALUES ('crm', ${options.subject ?? `Test Thread ${suffix}`}, ${options.createdById})
          RETURNING id, title, created_by_id, created_at, updated_at
        `,
        { query },
      )
      conversation = insertedConversation.rows[0] as {
        created_at: Date
        created_by_id: string
        id: string
        title: string
        updated_at: Date
      }
      await write(
        sql`/* insertTestCrmThread:addContactParticipant */
        INSERT INTO conversation_participants (conversation_id, crm_contact_id, role)
          VALUES (${conversation.id}, ${options.contactId}, 'owner')
        `,
        { query },
      )
    }

    await write(
      sql`/* insertTestCrmThread:addAdminParticipant */
        INSERT INTO conversation_participants (conversation_id, user_id, role)
        VALUES (${conversation.id}, ${options.createdById}, 'admin')
        ON CONFLICT (conversation_id, user_id) WHERE user_id IS NOT NULL AND removed_at IS NULL
        DO NOTHING
      `,
      { query },
    )

    const result = {
      __entity_type: 'crm_thread',
      archived_at: null,
      closed_at: null,
      contact_id: options.contactId,
      created_at: conversation.created_at,
      created_by_id: conversation.created_by_id,
      id: conversation.id,
      subject: conversation.title,
      updated_at: conversation.updated_at,
    } as CrmThread
    await transaction.commit()
    return result
  }
}
type InsertTestCrmMessageOptions = {
  threadId: string
  direction?: 'inbound' | 'outbound'
  fromEmail?: string
  toEmail?: string
  subject?: string
  bodyText?: string
  bodyHtml?: string | null
  sentById?: string | null
}
export async function insertTestCrmMessage(
  options: InsertTestCrmMessageOptions,
): Promise<CrmMessage> {
  const suffix = Math.random().toString(36).slice(2, 10)
  const direction = options.direction ?? 'outbound'
  const { rows } = await write(sql`
    INSERT INTO conversation_messages (
      conversation_id, kind, direction, created_by_id,
      email_from, email_to, email_subject, body_text, body_html, sent_at, received_at
    )
    VALUES (
      ${options.threadId},
      'email',
      ${direction},
      ${direction === 'outbound' ? (options.sentById ?? null) : null},
      ${options.fromEmail ?? `tests+sender-${suffix}@voucha.ai`},
      ${options.toEmail ?? `tests+recipient-${suffix}@voucha.ai`},
      ${options.subject ?? `Test Subject ${suffix}`},
      ${options.bodyText ?? `Test body ${suffix}`},
      ${options.bodyHtml ?? null},
      ${direction === 'outbound' ? new Date() : null},
      ${direction === 'inbound' ? new Date() : null}
    )
    RETURNING
      id,
      conversation_id,
      direction,
      email_from AS from_email,
      email_to AS to_email,
      email_subject AS subject,
      body_text,
      body_html,
      email_provider,
      email_message_id AS ses_message_id,
      sent_at,
      delivered_at,
      bounced_at,
      received_at,
      discarded_at,
      ai_prompt,
      ai_generated_at,
      created_by_id AS sent_by_id,
      created_at,
      updated_at,
      'crm_message' AS __entity_type
  `)
  return rows[0] as CrmMessage
}
