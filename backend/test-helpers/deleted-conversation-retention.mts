import { randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'

export type DeletedConversationFixture = {
  id: string
  userId: string
  notificationId: string | null
}

export async function insertDeletedConversationFixtureForTest(
  query: TransactionQuery,
  input: {
    deletedAt: Date | null
    withChildren?: boolean
    pendingPush?: boolean
    channelType?: 'chat' | 'direct_message' | 'modmail'
  },
): Promise<DeletedConversationFixture> {
  const { rows: users } = await query<{ id: string }>(
    `/* insertDeletedConversationUserForTest */ INSERT INTO users DEFAULT VALUES RETURNING id`,
  )
  const userId = users[0]!.id
  const channelType = input.channelType ?? 'chat'
  let communityId: string | null = null
  if (channelType === 'modmail') {
    const { rows } = await query<{ id: string }>(
      `/* insertDeletedModmailCommunityForTest */
       INSERT INTO communities (created_via, name, slug, created_by_id)
       VALUES ('system', 'Retention test', 'retention-' || replace(uuidv7()::text, '-', ''), $1)
       RETURNING id`,
      [userId],
    )
    communityId = rows[0]!.id
  }
  const { rows: conversations } = await query<{ id: string }>(
    `/* insertDeletedConversationForTest */
     INSERT INTO conversations (channel_type, created_by_id, community_id, deleted_at)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [channelType, userId, communityId, input.deletedAt],
  )
  const id = conversations[0]!.id
  if (!input.withChildren) return { id, userId, notificationId: null }

  await query(
    `/* insertDeletedConversationParticipantForTest */
     INSERT INTO conversation_participants (conversation_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [id, userId],
  )
  await query(
    `/* insertDeletedConversationMessagesForTest */
     INSERT INTO conversation_messages (conversation_id, created_by_id, created_via, content)
     VALUES ($1, $2, 'system', '{"text":"first"}'::jsonb),
            ($1, $2, 'system', '{"text":"second"}'::jsonb)`,
    [id, userId],
  )
  const { rows: notifications } = await query<{ id: string }>(
    `/* insertDeletedConversationNotificationForTest */
     INSERT INTO notifications (user_id, entity_type, conversation_id, target_path)
     VALUES ($1, 'direct_message', $2, '/messages') RETURNING id`,
    [userId, id],
  )
  const notificationId = notifications[0]!.id
  if (input.pendingPush) return { id, userId, notificationId }
  await markDeletedConversationPushIntentTerminalForTest(query, userId, notificationId)
  const { rows: subscriptions } = await query<{ id: string }>(
    `/* insertDeletedConversationPushSubscriptionForTest */
     INSERT INTO web_push_subscriptions
       (user_id, endpoint, p256dh, auth, deleted_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING id`,
    [userId, `https://example.com/${randomUUID()}`, 'c'.repeat(32), 'd'.repeat(16)],
  )
  await query(
    `/* insertDeletedConversationPushReceiptForTest */
     INSERT INTO notification_push_intent_subscription_receipts
       (user_id, notification_id, subscription_id, endpoint, delivered_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
    [userId, notificationId, subscriptions[0]!.id, `https://example.com/${randomUUID()}`],
  )
  return { id, userId, notificationId }
}

export async function markDeletedConversationPushIntentTerminalForTest(
  query: TransactionQuery,
  userId: string,
  notificationId: string,
): Promise<void> {
  await query(
    `/* markDeletedConversationPushIntentTerminalForTest */
     UPDATE notification_push_intents SET delivered_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND notification_id = $2`,
    [userId, notificationId],
  )
}

export async function getDeletedConversationDescendantCountsForTest(
  query: TransactionQuery,
  conversationId: string,
): Promise<{
  receipts: number
  intents: number
  notifications: number
  messages: number
  participants: number
}> {
  const { rows } = await query<{
    receipts: string
    intents: string
    notifications: string
    messages: string
    participants: string
  }>(
    `/* getDeletedConversationDescendantCountsForTest */
     SELECT
       (SELECT count(*) FROM notification_push_intent_subscription_receipts receipt
        JOIN notifications notification
          ON notification.user_id = receipt.user_id AND notification.id = receipt.notification_id
        WHERE notification.conversation_id = $1) AS receipts,
       (SELECT count(*) FROM notification_push_intents intent
        JOIN notifications notification
          ON notification.user_id = intent.user_id AND notification.id = intent.notification_id
        WHERE notification.conversation_id = $1) AS intents,
       (SELECT count(*) FROM notifications WHERE conversation_id = $1) AS notifications,
       (SELECT count(*) FROM conversation_messages WHERE conversation_id = $1) AS messages,
       (SELECT count(*) FROM conversation_participants WHERE conversation_id = $1) AS participants`,
    [conversationId],
  )
  const row = rows[0]!
  return {
    receipts: Number(row.receipts),
    intents: Number(row.intents),
    notifications: Number(row.notifications),
    messages: Number(row.messages),
    participants: Number(row.participants),
  }
}
