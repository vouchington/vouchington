import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createTestSubscriptionPostNotification(input: {
  userId: string
  postId: string
}): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createTestSubscriptionPostNotification */
    INSERT INTO notifications (
      user_id, entity_type, kind, post_id, target_path
    )
    VALUES (
      ${input.userId}, 'post', 'post_new', ${input.postId}, ${`/posts/${input.postId}`}
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
  await using transaction = await beginTransaction()
  if (input.publicationRssFeedItemId) {
    await transaction(
      `/* createTestOrphanRssFeedItemNotificationIdentity */
       INSERT INTO retained_rss_feed_item_identities (id) VALUES ($1)`,
      [input.publicationRssFeedItemId],
    )
  }
  const { rows } = await write<{ id: string }>(
    sql`/* createTestOrphanRssFeedItemNotification */
    INSERT INTO notifications (
      user_id, entity_type, kind, delivery_type, sent_by_id, publication_rss_feed_item_id,
      target_path
    )
    VALUES (
      ${input.userId}, 'rss_feed_item', 'rss_item_manual_send', 'manual_send', ${input.sentByUserId},
      ${input.publicationRssFeedItemId}, 'https://example.com/test'
    )
    RETURNING id
  `,
    { query: transaction },
  )
  await transaction.commit()
  return rows[0]!.id
}
