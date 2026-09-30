import { v7 } from 'uuid'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertNotificationWithMissingPublicationPost(
  userId: string,
): Promise<unknown> {
  return write(
    `/* insertNotificationWithMissingPublicationPost */ INSERT INTO notifications
      (user_id, entity_type, title, target_intent, publication_post_id)
      VALUES ($1, 'referral_click', 'Missing post', 'notifications_inbox', $2)`,
    [userId, v7()],
  )
}

export async function insertNotificationWithUserAsPublicationPost(
  userId: string,
): Promise<unknown> {
  return write(
    `/* insertNotificationWithUserAsPublicationPost */ INSERT INTO notifications
      (user_id, entity_type, title, target_intent, publication_post_id)
      VALUES ($1, 'referral_click', 'Wrong owner', 'notifications_inbox', $2)`,
    [userId, userId],
  )
}

export async function insertNotificationWithMissingPublicationRssItem(
  userId: string,
): Promise<unknown> {
  return write(
    `/* insertNotificationWithMissingPublicationRssItem */ INSERT INTO notifications
      (user_id, entity_type, title, target_intent, publication_rss_feed_item_id)
      VALUES ($1, 'referral_click', 'Missing item', 'notifications_inbox', $2)`,
    [userId, v7()],
  )
}

export async function insertSelectedDistributionWithoutRecipients(
  senderUserId: string,
  postId: string,
): Promise<unknown> {
  return write(
    `/* insertSelectedDistributionWithoutRecipients */ INSERT INTO follower_distributions
      (sender_user_id, action, audience, post_id)
      VALUES ($1, 'post_send', 'selected_followers', $2)`,
    [senderUserId, postId],
  )
}

export async function insertAllFollowersDistributionWithRecipient(
  senderUserId: string,
  postId: string,
  recipientUserId: string,
): Promise<void> {
  await using query = await beginTransaction()
  const { rows } = await query<{ id: string }>(
    sql`/* insertAllFollowersDistributionWithRecipient */ INSERT INTO follower_distributions
      (sender_user_id, action, audience, post_id)
      VALUES (${senderUserId}, 'post_send', 'all_followers', ${postId})
      RETURNING id`,
  )
  await query(
    sql`/* insertAllFollowersDistributionWithRecipient:row */ INSERT INTO follower_distribution_selected_recipients
      (distribution_id, recipient_user_id)
      VALUES (${rows[0]!.id}, ${recipientUserId})`,
  )
  await query.commit()
}

export async function insertDuplicateSelectedRecipient(
  senderUserId: string,
  postId: string,
  recipientUserId: string,
): Promise<void> {
  await using query = await beginTransaction()
  const { rows } = await query<{ id: string }>(
    sql`/* insertDuplicateSelectedRecipient */ INSERT INTO follower_distributions
      (sender_user_id, action, audience, post_id)
      VALUES (${senderUserId}, 'post_send', 'selected_followers', ${postId})
      RETURNING id`,
  )
  await query(
    sql`/* insertDuplicateSelectedRecipient:rows */ INSERT INTO follower_distribution_selected_recipients
      (distribution_id, recipient_user_id)
      VALUES (${rows[0]!.id}, ${recipientUserId}), (${rows[0]!.id}, ${recipientUserId})`,
  )
  await query.commit()
}

export async function insertUnknownSelectedRecipient(
  senderUserId: string,
  postId: string,
): Promise<void> {
  await using query = await beginTransaction()
  const { rows } = await query<{ id: string }>(
    sql`/* insertUnknownSelectedRecipient */ INSERT INTO follower_distributions
      (sender_user_id, action, audience, post_id)
      VALUES (${senderUserId}, 'post_send', 'selected_followers', ${postId})
      RETURNING id`,
  )
  await query(
    sql`/* insertUnknownSelectedRecipient:row */ INSERT INTO follower_distribution_selected_recipients
      (distribution_id, recipient_user_id)
      VALUES (${rows[0]!.id}, ${v7()})`,
  )
  await query.commit()
}

export async function insertOversizedSelectedRecipientSet(
  senderUserId: string,
  postId: string,
): Promise<void> {
  await using query = await beginTransaction()
  const { rows } = await query<{ id: string }>(
    sql`/* insertOversizedSelectedRecipientSet */ INSERT INTO follower_distributions
      (sender_user_id, action, audience, post_id)
      VALUES (${senderUserId}, 'post_send', 'selected_followers', ${postId})
      RETURNING id`,
  )
  const recipients = await query<{ id: string }>(sql`/* insertOversizedSelectedRecipientSet:users */
    INSERT INTO users (id)
    SELECT uuidv7() FROM generate_series(1, 101)
    RETURNING id
  `)
  await query(
    sql`/* insertOversizedSelectedRecipientSet:rows */ INSERT INTO follower_distribution_selected_recipients
      (distribution_id, recipient_user_id)
      SELECT ${rows[0]!.id}, recipient.id
      FROM unnest(${recipients.rows.map(row => row.id)}::uuid[]) AS recipient(id)`,
  )
  await query.commit()
}

export async function insertChatMessageWithoutContent(
  conversationId: string,
  createdById: string,
): Promise<unknown> {
  return write(
    `/* insertChatMessageWithoutContent */ INSERT INTO conversation_messages
      (conversation_id, created_by_id)
      VALUES ($1, $2)`,
    [conversationId, createdById],
  )
}

export async function insertLocalConversation(createdById: string): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* insertLocalConversation */ INSERT INTO conversations (created_by_id) VALUES ($1) RETURNING id`,
    [createdById],
  )
  return rows[0]!.id
}
