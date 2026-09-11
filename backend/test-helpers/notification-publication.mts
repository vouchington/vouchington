import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createTestSubscriptionPostNotification(input: {
  userId: string
  postId: string
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createTestSubscriptionPostNotification */
    INSERT INTO notifications (
      user_id, entity_type, post_id, title, body, target_path
    )
    VALUES (
      ${input.userId}, 'post', ${input.postId}, 'New discussion',
      'Test subscription content notification', ${`/posts/${input.postId}`}
    )
    RETURNING id
  `)
  return rows[0]!.id
}

export async function createTestOrphanRssFeedItemNotification(input: {
  userId: string
  sentByUserId: string
  publicationRssFeedItemId: string | null
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createTestOrphanRssFeedItemNotification */
    INSERT INTO notifications (
      user_id, entity_type, delivery_type, sent_by_user_id, publication_rss_feed_item_id,
      title, body, target_path
    )
    VALUES (
      ${input.userId}, 'rss_feed_item', 'manual_send', ${input.sentByUserId},
      ${input.publicationRssFeedItemId}, 'Someone sent you an article',
      'Test orphaned content notification', 'https://example.com/test'
    )
    RETURNING id
  `)
  return rows[0]!.id
}
