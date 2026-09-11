import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { SupportMessage, SupportMessageDirection } from './types.mts'
import { assertSupportMessageBody } from './body-validation.mts'
import { enqueueSupportMessageEmbedding } from './enqueue-side-effects.mts'

export async function createSupportMessage(
  threadId: string,
  params: {
    direction: SupportMessageDirection
    bodyText: string
    bodyHtml?: string
    createdById?: string
    emailMessageId?: string
    emailSubject?: string
    emailFrom?: string
    emailTo?: string
  },
  options: { skipEnqueue?: boolean } & QueryOptions = {},
): Promise<SupportMessage> {
  assertSupportMessageBody(params.bodyText, params.bodyHtml)

  const emailMessageId = params.emailMessageId?.trim() || null
  const { rows } = await write(
    sql`/* createSupportMessage */
    INSERT INTO support_messages (
      support_thread_id,
      direction,
      body_text,
      body_html,
      created_by_id,
      email_message_id,
      email_subject,
      email_from,
      email_to
    ) VALUES (
      ${threadId},
      ${params.direction},
      ${params.bodyText},
      ${params.bodyHtml ?? ''},
      ${params.createdById ?? null},
      ${emailMessageId},
      ${params.emailSubject ?? null},
      ${params.emailFrom ?? null},
      ${params.emailTo ?? null}
    )
    RETURNING
      id,
      support_thread_id,
      direction,
      body_text,
      body_html,
      created_at,
      created_by_id,
      updated_at,
      email_message_id,
      email_subject,
      email_from,
      email_to,
      drafted_at,
      edited_at,
      edited_by_id,
      approved_at,
      approved_by_id,
      sent_at
  `,
    options,
  )
  const message = rows[0] as SupportMessage

  if (!options.skipEnqueue) {
    enqueueSupportMessageEmbedding(threadId, message.id)
  }

  return message
}
