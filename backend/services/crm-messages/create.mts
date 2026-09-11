import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { CrmMessage, CreateCrmMessageInput } from './types.mts'

export async function createCrmMessage(input: CreateCrmMessageInput): Promise<CrmMessage> {
  assert(input.body_text || input.body_html, 422, 'body_text or body_html is required')
  assert(
    input.direction === 'inbound' || input.sent_by_id,
    422,
    'sent_by_id required for outbound messages',
  )

  const fromEmail = input.from_email.trim().toLowerCase()
  const toEmail = input.to_email.trim().toLowerCase()

  const { rows } = await write(sql`/* createCrmMessage */
    INSERT INTO conversation_messages (
      conversation_id, created_by_id, crm_contact_id, kind, direction,
      email_from, email_to, email_subject, body_text, body_html,
      email_provider, ai_prompt, ai_generated_at, sent_at, received_at
    )
    VALUES (
      ${input.conversation_id},
      ${input.direction === 'outbound' ? input.sent_by_id : null},
      ${input.direction === 'inbound' ? input.contact_id : null},
      'email',
      ${input.direction},
      ${fromEmail},
      ${toEmail},
      ${input.subject ?? null},
      ${input.body_text ?? null},
      ${input.body_html ?? null},
      ${input.email_provider ?? null},
      ${input.ai_prompt ?? null},
      ${input.ai_generated_at ?? null},
      ${input.direction === 'outbound' ? new Date() : null},
      ${input.direction === 'inbound' ? new Date() : null}
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
