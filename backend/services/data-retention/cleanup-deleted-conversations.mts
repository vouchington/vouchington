/* oxlint-disable no-await-in-loop -- child families must be drained in FK order within one capped transaction. */
import type { TransactionQuery } from '@data-stores/psql'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import type {
  OperationalTombstoneCursor as Cursor,
  OperationalTombstonePageResult,
} from './cleanup-operational-tombstone-types.mts'
import { CHILD_STAGES } from './cleanup-deleted-conversation-stages.mts'
import {
  checkpoint,
  hasNotifications,
  hasPendingPushIntent,
  listCandidate,
} from './cleanup-deleted-conversation-cursor.mts'

/** One staged SQL page inside its caller-owned short transaction. */
export async function cleanupDeletedConversationPage(
  query: TransactionQuery,
  batchSize: number,
  options: { now?: Date },
): Promise<OperationalTombstonePageResult> {
  await query(
    `/* ensureDeletedConversationRetentionCursor */
     INSERT INTO operational_tombstone_retention_cursors (cleanup_name)
     VALUES ('deleted_conversations') ON CONFLICT DO NOTHING`,
  )
  const cursor = (
    await query<Cursor>(
      `/* lockDeletedConversationRetentionCursor */
       SELECT cursor_at::text AS cursor_at, cursor_record_id, sweep_cutoff_at
       FROM operational_tombstone_retention_cursors
       WHERE cleanup_name = 'deleted_conversations' FOR UPDATE`,
    )
  ).rows[0]
  const cutoff = cursor.sweep_cutoff_at ?? getRetentionCutoffDate(30, options.now)
  const candidate = await listCandidate(query, cutoff, cursor)
  if (!candidate) {
    await checkpoint(query, null, null)
    return { deleted: 0, hasMore: false, continuation: null, stalled: false }
  }

  if (await hasPendingPushIntent(query, candidate.id)) {
    await checkpoint(query, candidate, cutoff)
    return {
      deleted: 0,
      hasMore: true,
      continuation: { at: candidate.position_at, id: candidate.id },
      stalled: false,
    }
  }

  const notification = await query<{ user_id: string; id: string }>(
    `/* listDeletedConversationNotification */
     -- no-mistakes-disable-next-line postgres-required-predicates: conversation spans recipients; conversation_id leading index bounds the page across user partitions
     SELECT user_id, id FROM notifications
     WHERE conversation_id = $1::uuid
     ORDER BY conversation_id, id, user_id
     LIMIT 1 FOR UPDATE SKIP LOCKED`,
    [candidate.id],
  )
  const firstNotification = notification.rows[0]
  if (firstNotification) {
    const intent = await query<{ status: string }>(
      `/* lockDeletedConversationPushIntent */
       SELECT status FROM notification_push_intents
       WHERE user_id = $1::uuid AND notification_id = $2::uuid FOR UPDATE SKIP LOCKED`,
      [firstNotification.user_id, firstNotification.id],
    )
    if (!intent.rows[0]) {
      const lockedIntent = await query<{ remaining: boolean }>(
        `/* hasLockedDeletedConversationPushIntent */
         SELECT EXISTS (
           SELECT 1 FROM notification_push_intents
           WHERE user_id = $1::uuid AND notification_id = $2::uuid LIMIT 1
         ) AS remaining`,
        [firstNotification.user_id, firstNotification.id],
      )
      if (lockedIntent.rows[0]?.remaining) {
        await checkpoint(query, cursor, cutoff)
        return { deleted: 0, hasMore: true, continuation: null, stalled: true }
      }
    }
    if (intent.rows[0]?.status === 'pending') {
      await checkpoint(query, candidate, cutoff)
      return {
        deleted: 0,
        hasMore: true,
        continuation: { at: candidate.position_at, id: candidate.id },
        stalled: false,
      }
    }
    const receiptPage = await query<{ subscription_id: string }>(
      `/* listDeletedConversationNotificationReceiptPage */
       SELECT subscription_id FROM notification_push_intent_subscription_receipts
       WHERE user_id = $1::uuid AND notification_id = $2::uuid
       ORDER BY user_id, notification_id, subscription_id
       LIMIT $3 FOR UPDATE SKIP LOCKED`,
      [firstNotification.user_id, firstNotification.id, batchSize],
    )
    if (receiptPage.rows.length > 0) {
      await query(
        `/* deleteDeletedConversationNotificationReceiptPage */
         DELETE FROM notification_push_intent_subscription_receipts
         WHERE user_id = $1::uuid AND notification_id = $2::uuid
           AND subscription_id = ANY($3::uuid[])`,
        [
          firstNotification.user_id,
          firstNotification.id,
          receiptPage.rows.map(receipt => receipt.subscription_id),
        ],
      )
      await checkpoint(query, cursor, cutoff)
      return { deleted: 0, hasMore: true, continuation: null, stalled: false }
    }
    const remainingReceipts = await query<{ remaining: boolean }>(
      `/* hasDeletedConversationNotificationReceipts */
       SELECT EXISTS (
         SELECT 1 FROM notification_push_intent_subscription_receipts
         WHERE user_id = $1::uuid AND notification_id = $2::uuid LIMIT 1
       ) AS remaining`,
      [firstNotification.user_id, firstNotification.id],
    )
    if (remainingReceipts.rows[0]?.remaining) {
      await checkpoint(query, cursor, cutoff)
      return { deleted: 0, hasMore: true, continuation: null, stalled: true }
    }
    await deleteRetainedConversationNotification(query, firstNotification, candidate.id)
    await checkpoint(query, cursor, cutoff)
    return { deleted: 0, hasMore: true, continuation: null, stalled: false }
  }
  if (await hasNotifications(query, candidate.id)) {
    await checkpoint(query, cursor, cutoff)
    return { deleted: 0, hasMore: true, continuation: null, stalled: true }
  }

  for (const stage of CHILD_STAGES) {
    // no-mistakes-disable-next-line query-reached-per-item: fixed FK-ordered child stages each delete at most batchSize rows in this one parent transaction
    const deleted = await query(stage.deletion, [candidate.id, batchSize])
    if ((deleted.rowCount ?? 0) > 0) {
      // no-mistakes-disable-next-line query-reached-per-item: checkpoint must follow the bounded child deletion in the same transaction
      await checkpoint(query, cursor, cutoff)
      return { deleted: 0, hasMore: true, continuation: null, stalled: false }
    }
    // A locked child keeps the parent until next run, preventing unbounded CASCADE work.
    // no-mistakes-disable-next-line query-reached-per-item: each fixed child stage checks for remaining rows before the next FK-ordered stage
    const remains = await query<{ remaining: boolean }>(stage.remaining, [candidate.id])
    if (remains.rows[0]?.remaining) {
      // no-mistakes-disable-next-line query-reached-per-item: a skipped locked child keeps the parent and checkpoint together
      await checkpoint(query, cursor, cutoff)
      return { deleted: 0, hasMore: true, continuation: null, stalled: true }
    }
  }
  const { rowCount } = await query(
    `/* deleteEmptyRetainedConversation */
     DELETE FROM conversations
     WHERE id = $1::uuid AND deleted_at < $2::timestamptz
       AND channel_type IN ('chat', 'direct_message')`,
    [candidate.id, cutoff],
  )
  await checkpoint(query, candidate, cutoff)
  return {
    deleted: rowCount ?? 0,
    hasMore: true,
    continuation: { at: candidate.position_at, id: candidate.id },
    stalled: false,
  }
}

/** Remove the terminal push intent before its notification, preserving their FK order. */
async function deleteRetainedConversationNotification(
  query: TransactionQuery,
  notification: { user_id: string; id: string },
  conversationId: string,
): Promise<void> {
  await query(
    `/* deleteDeletedConversationNotificationIntent */
     DELETE FROM notification_push_intents
     WHERE user_id = $1::uuid AND notification_id = $2::uuid
       AND status IN ('delivered', 'suppressed')`,
    [notification.user_id, notification.id],
  )
  await query(
    `/* deleteDeletedConversationNotification */
     DELETE FROM notifications
     WHERE user_id = $1::uuid AND id = $2::uuid AND conversation_id = $3::uuid`,
    [notification.user_id, notification.id, conversationId],
  )
}
