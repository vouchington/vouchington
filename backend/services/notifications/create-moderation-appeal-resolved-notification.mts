import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

export async function createModerationAppealResolvedNotification(
  userId: string,
  appealId: string,
  publicResponse: string,
): Promise<void> {
  const body = publicResponse.slice(0, 1000)
  const { rows } = await write(sql`/* createModerationAppealResolvedNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      moderation_appeal_id,
      delivery_type,
      title,
      body,
      target_path
    )
    VALUES (
      ${userId},
      'moderation_appeal',
      ${appealId},
      'subscription',
      'Your moderation appeal has been resolved',
      ${body},
      '/my/appeals'
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
