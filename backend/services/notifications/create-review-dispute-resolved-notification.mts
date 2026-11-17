import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

export async function createReviewDisputeResolvedNotification(
  userId: string,
  disputeId: string,
): Promise<void> {
  const { rows } = await write(sql`/* createReviewDisputeResolvedNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      review_dispute_id,
      kind,
      delivery_type,
      target_path
    )
    VALUES (
      ${userId},
      'review_dispute',
      ${disputeId},
      'review_dispute_resolved',
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
