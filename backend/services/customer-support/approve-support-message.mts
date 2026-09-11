import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { lockSupportThread } from './lock-support-thread.mts'
import { getSupportThreadById } from './threads.mts'

export async function approveSupportMessage(
  threadId: string,
  messageId: string,
  approvedById: string,
): Promise<void> {
  await using query = await beginTransaction()
  const locked = await lockSupportThread(threadId, { query })
  assert(locked, 404, 'Thread not found')
  const thread = await getSupportThreadById(threadId, { query, readOnly: false })
  assert(thread, 404, 'Thread not found')
  assert(thread.resolved_at == null, 409, 'Reopen this thread before approving a draft')
  const { rows } = await query(sql`/* approveSupportMessage */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    updated_message AS (
      UPDATE support_messages
      SET approved_at = NOW(),
          approved_by_id = ${approvedById},
          latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id),
          updated_at = CURRENT_TIMESTAMP
    WHERE support_thread_id = ${threadId}
        AND id = ${messageId}
        AND drafted_at IS NOT NULL
        AND approved_at IS NULL
        AND sent_at IS NULL
      RETURNING
        id,
        support_thread_id,
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
        'approve',
        ${approvedById},
        updated_message.drafted_at,
        updated_message.edited_at,
        updated_message.edited_by_id,
        updated_message.approved_at,
        updated_message.approved_by_id,
        updated_message.sent_at
      FROM updated_message
      CROSS JOIN lifecycle_change_id
    )
    SELECT id FROM updated_message
  `)
  assert(rows[0], 422, 'Message has already been approved')

  await query.commit()
}
