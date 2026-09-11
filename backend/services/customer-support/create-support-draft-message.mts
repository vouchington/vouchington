import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { SupportMessage } from './types.mts'
import { assertSupportMessageBody } from './body-validation.mts'

export async function createSupportDraftMessage(
  threadId: string,
  params: {
    bodyText: string
    bodyHtml?: string
    agentRunId?: string
  },
): Promise<SupportMessage> {
  assertSupportMessageBody(params.bodyText, params.bodyHtml)
  const metadata = params.agentRunId ? { agentRunId: params.agentRunId } : {}

  await using query = await beginTransaction()
  const { rows } = await query(sql`/* createSupportDraftMessage */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    inserted_message AS (
      INSERT INTO support_messages (
        support_thread_id,
        direction,
        body_text,
        body_html,
        drafted_at,
        latest_lifecycle_change_id
      )
      SELECT
        ${threadId},
        'outbound',
        ${params.bodyText},
        ${params.bodyHtml ?? ''},
        NOW(),
        lifecycle_change_id.id
      FROM lifecycle_change_id
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
    ),
    recorded_change AS (
      INSERT INTO support_message_lifecycle_changes (
        id,
        support_thread_id,
        support_message_id,
        change_type,
        metadata,
        drafted_at,
        edited_at,
        edited_by_id,
        approved_at,
        approved_by_id,
        sent_at
      )
      SELECT
        lifecycle_change_id.id,
        inserted_message.support_thread_id,
        inserted_message.id,
        'create_draft',
        ${JSON.stringify(metadata)}::jsonb,
        inserted_message.drafted_at,
        inserted_message.edited_at,
        inserted_message.edited_by_id,
        inserted_message.approved_at,
        inserted_message.approved_by_id,
        inserted_message.sent_at
      FROM inserted_message
      CROSS JOIN lifecycle_change_id
    )
    SELECT *
    FROM inserted_message
  `)

  const result = rows[0] as SupportMessage

  await query.commit()
  return result
}
