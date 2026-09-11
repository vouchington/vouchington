import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { SupportMessage } from './types.mts'
import { assertSupportMessageBody, createSupportMessageBodyError } from './body-validation.mts'
import { lockSupportThread } from './lock-support-thread.mts'
import { getSupportThreadById } from './threads.mts'

export async function updateSupportDraftMessage(
  threadId: string,
  messageId: string,
  params: {
    bodyText?: string
    bodyHtml?: string
    editedById: string
  },
): Promise<SupportMessage | null> {
  if (params.bodyText !== undefined && params.bodyHtml !== undefined) {
    assertSupportMessageBody(params.bodyText, params.bodyHtml)
  }

  const query = sql`/* updateSupportDraftMessage */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    updated_message AS (
      UPDATE support_messages
      SET edited_at = NOW(),
          edited_by_id = ${params.editedById},
          latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id),
          updated_at = CURRENT_TIMESTAMP
  `
  if (params.bodyText !== undefined) {
    query.append(sql`, body_text = ${params.bodyText}`)
  }
  if (params.bodyHtml !== undefined) {
    query.append(sql`, body_html = ${params.bodyHtml}`)
  }
  query.append(sql`
    WHERE support_thread_id = ${threadId}
      AND id = ${messageId}
      AND drafted_at IS NOT NULL
      AND approved_at IS NULL
      AND sent_at IS NULL
  `)

  query.append(sql`
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
        changed_by_id,
        drafted_at,
        edited_at,
        edited_by_id,
        approved_at,
        approved_by_id,
        sent_at
      )
      SELECT
        lifecycle_change_id.id,
        updated_message.support_thread_id,
        updated_message.id,
        'edit_draft',
        ${params.editedById},
        updated_message.drafted_at,
        updated_message.edited_at,
        updated_message.edited_by_id,
        updated_message.approved_at,
        updated_message.approved_by_id,
        updated_message.sent_at
      FROM updated_message
      CROSS JOIN lifecycle_change_id
    )
    SELECT *
    FROM updated_message
  `)
  try {
    await using transaction = await beginTransaction()

    const locked = await lockSupportThread(threadId, { query: transaction })
    if (!locked) {
      await transaction.commit()
      return null
    }
    const thread = await getSupportThreadById(threadId, { query: transaction, readOnly: false })
    if (!thread) {
      await transaction.commit()
      return null
    }
    assert(thread.resolved_at == null, 409, 'Reopen this thread before editing a draft')
    const { rows } = await transaction(query)
    await transaction.commit()
    return (rows[0] as SupportMessage) ?? null
  } catch (error) {
    const pgError = error as { code?: string; constraint?: string }
    if (pgError.code === '23514' && pgError.constraint === 'chk_support_messages__body_not_empty') {
      throw createSupportMessageBodyError()
    }
    throw error
  }
}
