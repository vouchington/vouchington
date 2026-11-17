import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

export async function createCommunityBanNotification(userId: string, banId: string): Promise<void> {
  const { rows } = await write(sql`/* createCommunityBanNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      community_ban_id,
      kind,
      delivery_type,
      target_path
    )
    VALUES (
      ${userId},
      'community_ban',
      ${banId},
      'community_ban',
      'subscription',
      '/my/bans'
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
