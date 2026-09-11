import { beginTransaction, read, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getSupportMessageById } from './get-support-message-by-id.mts'
import { enqueueSendSupportEmail } from '@queues/emails/enqueues'

export async function sendApprovedSupportMessage(
  threadId: string,
  messageId: string,
  sentById?: string | null,
): Promise<void> {
  const message = await getSupportMessageById(threadId, messageId)
  assert(message, 404, 'Message not found')
  assert(message.approved_at != null, 422, 'Message must be approved before sending')
  assert(message.sent_at == null, 422, 'Message has already been sent')

  const { rows } = await read(sql`/* sendApprovedSupportMessage:getContact */
    SELECT sc.email_address, u.ui_locale
    FROM support_threads st
    JOIN support_contacts sc ON sc.id = st.support_contact_id
    LEFT JOIN users u ON u.id = sc.user_id
    WHERE st.id = ${threadId}
    LIMIT 1
  `)
  assert(rows[0], 404, 'Support thread or contact not found')
  const contact = rows[0] as { email_address: string; ui_locale: string | null }

  await using query = await beginTransaction()

  const { rows: updatedRows } = await query(sql`/* sendApprovedSupportMessage */
      WITH lifecycle_change_id AS (
        SELECT uuidv7() AS id
      ),
      open_thread AS (
        SELECT id
        FROM support_threads
        WHERE id = ${threadId}
          AND resolved_at IS NULL
        FOR UPDATE
      ),
      updated_message AS (
        UPDATE support_messages
        SET sent_at = NOW(),
            latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE support_thread_id = ${threadId}
          AND id = ${messageId}
          AND approved_at IS NOT NULL
          AND sent_at IS NULL
          AND EXISTS (SELECT 1 FROM open_thread)
        RETURNING
          id,
          support_thread_id,
          body_text,
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
          'send',
          ${sentById ?? null},
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

  const sendResult = updatedRows[0]
    ? { message: updatedRows[0] as typeof message, resolved: false }
    : await getSupportMessageSendResult(query, threadId)

  await query.commit()

  assert(!sendResult.resolved, 409, 'Reopen this thread before sending a reply')
  assert(sendResult.message, 422, 'Message has already been sent')
  void enqueueSendSupportEmail(
    { emailAddress: contact.email_address, uiLocale: contact.ui_locale },
    { bodyText: sendResult.message.body_text },
  )
}

async function getSupportMessageSendResult(
  query: TransactionQuery,
  threadId: string,
): Promise<{ message: null; resolved: boolean }> {
  const { rows: threadRows } = await query<{ resolved: boolean }>(
    sql`/* sendApprovedSupportMessage:checkThreadResolution */
        SELECT resolved_at IS NOT NULL AS resolved
        FROM support_threads
        WHERE id = ${threadId}
      `,
  )
  return { message: null, resolved: threadRows[0]?.resolved ?? false }
}
