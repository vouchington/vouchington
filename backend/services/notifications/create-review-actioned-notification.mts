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
  const body =
    action === 'remove'
      ? 'A moderator has removed your review following a dispute. You may contact support if you believe this was in error.'
      : 'A moderator has added a contextual note to your review following a dispute.'
  const { rows } = await write(sql`/* createReviewActionedNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      review_dispute_id,
      delivery_type,
      title,
      body,
      target_path
    )
    VALUES (
      ${postAuthorUserId},
      'review_dispute',
      ${disputeId},
      'subscription',
      'Your review has been actioned by a moderator',
      ${body},
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
