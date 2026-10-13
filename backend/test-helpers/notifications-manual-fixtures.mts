import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createTestManualPostNotification(input: {
  userId: string
  sentByUserId: string
  postId: string
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createTestManualPostNotification */
    INSERT INTO notifications (
      user_id, entity_type, delivery_type, sent_by_id, post_id, title, body, target_path
    )
    VALUES (
      ${input.userId}, 'post', 'manual_send', ${input.sentByUserId}, ${input.postId},
      'Someone sent you a post', 'Test content notification', ${`/discussion/${input.postId}`}
    )
    RETURNING id
  `)
  return rows[0]!.id
}
export async function createTestManualRssFeedItemNotification(input: {
  userId: string
  sentByUserId: string
  rssFeedItemId: string
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createTestManualRssFeedItemNotification */
    INSERT INTO notifications (
      user_id, entity_type, delivery_type, sent_by_id, rss_feed_item_id, title, body, target_path
    )
    VALUES (
      ${input.userId}, 'rss_feed_item', 'manual_send', ${input.sentByUserId}, ${input.rssFeedItemId},
      'Someone sent you an article', 'Test content notification', 'https://example.com/test'
    )
    RETURNING id
  `)
  return rows[0]!.id
}
