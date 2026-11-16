import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

/**
 * Notifies the review post's *author* (not the disputant) that a moderator actioned their review.
 * Fire-and-forget — do not await at the call site.
 */
export async function createReviewActionedNotification(
  postAuthorUserId: string,
  disputeId: string,
  action: 'remove' | 'annotate',
): Promise<void> {
  const kind = action === 'remove' ? 'review_actioned_removed' : 'review_actioned_note'
  const { rows } = await write(sql`/* createReviewActionedNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      review_dispute_id,
      kind,
      delivery_type,
      target_path
    )
    VALUES (
      ${postAuthorUserId},
      'review_dispute',
      ${disputeId},
      ${kind}::notification_kinds,
      'subscription',
      '/my/disputes'
    )
    ON CONFLICT DO NOTHING
    RETURNING user_id, id
  `)
  const row = rows[0] as { user_id: string; id: string } | undefined
  if (row) {
    await enqueueBulkDeliverNotificationPushIntents([
      { userId: row.user_id, notificationId: row.id },
    ])
  }
}
