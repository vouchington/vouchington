import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createTestManualPostNotification(input: {
  id?: string
  userId: string
  sentByUserId: string
  postId: string
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createTestManualPostNotification */
    INSERT INTO notifications (
      id, user_id, entity_type, kind, delivery_type, sent_by_id, post_id, target_path
    )
    VALUES (
      COALESCE(${input.id ?? null}::uuid, uuidv7()), ${input.userId}, 'post', 'post_manual_send', 'manual_send', ${input.sentByUserId}, ${input.postId},
      ${`/discussion/${input.postId}`}
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
      user_id, entity_type, kind, delivery_type, sent_by_id, rss_feed_item_id, target_path
    )
    VALUES (
      ${input.userId}, 'rss_feed_item', 'rss_item_manual_send', 'manual_send', ${input.sentByUserId}, ${input.rssFeedItemId},
      'https://example.com/test'
    )
    RETURNING id
  `)
  return rows[0]!.id
}
