import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

export async function createPostRemovedNotification(
  authorUserId: string,
  postId: string,
): Promise<void> {
  const { rows } = await write(sql`/* createPostRemovedNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      post_id,
      kind,
      delivery_type,
      target_path
    )
    VALUES (
      ${authorUserId}::uuid,
      'post',
      ${postId}::uuid,
      'post_removed',
      'subscription',
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
