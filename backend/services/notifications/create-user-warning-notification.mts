import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

export async function createUserWarningNotification(
  userId: string,
  warningId: string,
  publicMessage: string | null,
): Promise<void> {
  const body = (publicMessage ?? 'A moderator has issued a warning to your account.').slice(0, 1000)
  const { rows } = await write(sql`/* createUserWarningNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      user_warning_id,
      delivery_type,
      title,
      body,
      target_path
    )
    VALUES (
      ${userId}::uuid,
      'user_warning',
      ${warningId}::uuid,
      'subscription',
      'You received a warning',
      ${body},
      '/my/warnings'
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
