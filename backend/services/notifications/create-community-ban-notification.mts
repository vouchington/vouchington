import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

export async function createCommunityBanNotification(userId: string, banId: string): Promise<void> {
  const { rows } = await write(sql`/* createCommunityBanNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      community_ban_id,
      delivery_type,
      title,
      body,
      target_path
    )
    VALUES (
      ${userId},
      'community_ban',
      ${banId},
      'subscription',
      'You have been banned from a community',
      'A moderator has banned you from a community. You may file an appeal if you believe this was in error.',
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
