import type { TransactionQuery } from '@data-stores/psql'
import type {
  OperationalTombstoneCandidate as Candidate,
  OperationalTombstoneCursor as Cursor,
} from './cleanup-operational-tombstone-types.mts'

export async function hasPendingPushIntent(
  query: TransactionQuery,
  conversationId: string,
): Promise<boolean> {
  // The partial index checks the whole conversation without visiting its notifications.
  const { rows } = await query<{ user_id: string; notification_id: string }>(
    `/* hasPendingDeletedConversationPushIntent */
     SELECT user_id, notification_id FROM notification_push_intents
     WHERE conversation_id = $1::uuid AND status = 'pending'
     ORDER BY conversation_id, user_id, notification_id LIMIT 1`,
    [conversationId],
  )
  return rows.length > 0
}

export async function hasNotifications(
  query: TransactionQuery,
  conversationId: string,
): Promise<boolean> {
  const { rows } = await query<{ id: string; user_id: string }>(
    `/* hasDeletedConversationNotifications */
     -- no-mistakes-disable-next-line postgres-required-predicates: a conversation spans user partitions; conversation_id leading index bounds the ordered existence probe
     SELECT id, user_id FROM notifications WHERE conversation_id = $1::uuid
     ORDER BY conversation_id, id, user_id LIMIT 1`,
    [conversationId],
  )
  return rows.length > 0
}

export async function listCandidate(
  query: TransactionQuery,
  cutoff: Date,
  cursor: Cursor,
): Promise<Candidate | undefined> {
  const parameters: unknown[] = [cutoff]
  const afterCursor =
    cursor.cursor_at && cursor.cursor_record_id
      ? `AND (conversation.deleted_at, conversation.id) >
       ($${parameters.push(cursor.cursor_at)}::timestamptz, $${parameters.push(cursor.cursor_record_id)}::uuid)`
      : ''
  const { rows } = await query<Candidate>(
    `/* no-mistakes: deadlock-safe -- one indexed candidate is locked with SKIP LOCKED after the cursor; no row waits behind another sweeper. */
     /* listDeletedConversationRetentionCandidate */
       SELECT conversation.id, conversation.deleted_at::text AS position_at
       FROM conversations conversation
       WHERE conversation.deleted_at < $1::timestamptz
         AND conversation.channel_type IN ('chat', 'direct_message')
         ${afterCursor}
       ORDER BY conversation.deleted_at, conversation.id
       LIMIT 1 FOR UPDATE OF conversation SKIP LOCKED`,
    parameters,
  )
  return rows[0]
}

export async function checkpoint(
  query: TransactionQuery,
  position: { position_at: string; id: string } | Cursor | null,
  cutoff: Date | null,
): Promise<void> {
  const at = position && 'position_at' in position ? position.position_at : position?.cursor_at
  const id = position && 'cursor_record_id' in position ? position.cursor_record_id : position?.id
  await query(
    `/* checkpointDeletedConversationRetentionCursor */
     UPDATE operational_tombstone_retention_cursors
     SET cursor_at = $1::timestamptz, cursor_record_id = $2::uuid, sweep_cutoff_at = $3::timestamptz
     WHERE cleanup_name = 'deleted_conversations'`,
    [at ?? null, id ?? null, cutoff],
  )
}
