import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { DATA_RETENTION_MAX_VALUES } from '@services/data-retention/config'
import sql from 'sql-template-strings'
import { seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export const conversationRetentionPageSize = DATA_RETENTION_MAX_VALUES.batch_size
const participantCap = 50
const backgroundConversations = 60

export async function seedDeletedConversationRetentionCapacity() {
  const prefix = `retention-capacity-${randomUUID()}`
  await using query = await beginTransaction()
  const { rows: conversations } = await query<{ id: string; title: string }>(sql`
    /* seedConversationRetentionCapacity:conversations */
    INSERT INTO conversations (title, created_by_id, deleted_at)
    SELECT ${prefix}::text || ':' || n, ${seedUser.id},
      CASE WHEN n < 3 THEN '1900-01-01'::timestamptz + n * interval '1 second' END
    FROM generate_series(0, ${backgroundConversations + 2}::int) AS fixture(n)
    RETURNING id, title
  `)
  const [receiptConversation, messageConversation, participantConversation] = [0, 1, 2].map(
    n => conversations.find(row => row.title === `${prefix}:${n}`)!.id,
  )
  const otherConversations = conversations
    .filter(
      row => ![receiptConversation, messageConversation, participantConversation].includes(row.id),
    )
    .map(row => row.id)
  const { rows: messages } = await query<{ id: string; conversation_id: string }>(sql`
    /* seedConversationRetentionCapacity:messages */
    INSERT INTO conversation_messages (conversation_id, created_by_id, created_via, content)
    SELECT conversation_id, ${seedUser.id}, 'system', jsonb_build_object('text', 'Retention message ' || n)
    FROM unnest(${[messageConversation, ...otherConversations]}::uuid[]) WITH ORDINALITY AS seed(conversation_id, ordinal)
    CROSS JOIN LATERAL generate_series(
      1, CASE WHEN ordinal = 1 THEN ${conversationRetentionPageSize + 1} ELSE 100 END
    ) AS fixture(n)
    ORDER BY n, ordinal
    RETURNING id, conversation_id
  `)
  const userIds = Array.from({ length: participantCap }, (_, n) => seedUuid(n + 6_000, '01'))
  const { rows: participants } = await query<{ id: string; conversation_id: string }>(sql`
    /* seedConversationRetentionCapacity:participants */
    INSERT INTO conversation_participants (conversation_id, user_id, participant_slot, role, removed_at)
    SELECT conversation_id, user_id, slot,
      CASE WHEN slot = 1 THEN 'owner'::conversation_participant_roles ELSE 'member'::conversation_participant_roles END,
      CASE WHEN slot % 4 = 0 THEN CURRENT_TIMESTAMP END
    FROM unnest(${[participantConversation, ...otherConversations]}::uuid[]) AS c(conversation_id)
    CROSS JOIN unnest(${userIds}::uuid[]) WITH ORDINALITY AS u(user_id, slot)
    RETURNING id, conversation_id
  `)
  const { rows: notifications } = await query<{ id: string; conversation_id: string }>(sql`
    /* seedConversationRetentionCapacity:notifications */
    INSERT INTO notifications (user_id, entity_type, kind, conversation_id, target_path)
    SELECT ${seedUser.id}, 'direct_message', 'direct_message', conversation_id, '/messages'
    FROM unnest(${[receiptConversation, ...otherConversations]}::uuid[]) AS input(conversation_id)
    RETURNING id, conversation_id
  `)
  const notificationId = notifications.find(row => row.conversation_id === receiptConversation)!.id
  const notificationIds = notifications.map(row => row.id)
  await query(sql`
    /* seedConversationRetentionCapacity:terminalIntents */
    UPDATE notification_push_intents SET delivered_at = CURRENT_TIMESTAMP
    WHERE user_id = ${seedUser.id} AND notification_id = ANY(${notificationIds}::uuid[])
  `)
  const { rows: subscriptions } = await query<{ id: string; endpoint: string }>(sql`
    /* seedConversationRetentionCapacity:subscriptions */
    INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh, auth, deleted_at)
    SELECT ${seedUser.id}, 'https://example.invalid/' || ${prefix}::text || '/' || n,
      repeat('a', 32), repeat('b', 16), CURRENT_TIMESTAMP
    FROM generate_series(1, ${conversationRetentionPageSize + 1}::int) AS fixture(n)
    RETURNING id, endpoint
  `)
  await query(sql`
    /* seedConversationRetentionCapacity:receipts */
    INSERT INTO notification_push_intent_subscription_receipts
      (user_id, notification_id, subscription_id, endpoint, delivered_at)
    SELECT ${seedUser.id}, notification_id, subscription_id, endpoint, CURRENT_TIMESTAMP
    FROM unnest(${[notificationId, ...notificationIds.filter(id => id !== notificationId)]}::uuid[])
      WITH ORDINALITY AS notifications(notification_id, ordinal)
    CROSS JOIN unnest(${subscriptions.map(row => row.id)}::uuid[], ${subscriptions.map(row => row.endpoint)}::text[])
      WITH ORDINALITY AS subscriptions(subscription_id, endpoint, n)
    WHERE ordinal = 1 OR n <= 100
  `)
  await query.commit()
  const backgroundId = otherConversations[0]!
  return {
    receiptConversation,
    messageConversation,
    participantConversation,
    notificationId,
    backgroundId,
    otherConversationIds: otherConversations,
    backgroundNotification: notifications.find(row => row.conversation_id === backgroundId)!.id,
    messageIds: ownedIds(messages, messageConversation),
    participantIds: ownedIds(participants, participantConversation),
    otherMessageIds: ownedIds(messages, backgroundId),
    otherParticipantIds: participants
      .filter(row => row.conversation_id !== participantConversation)
      .map(row => row.id)
      .toSorted(),
    receiptIds: subscriptions.map(row => row.id).toSorted(),
    otherReceiptIds: subscriptions
      .slice(0, 100)
      .map(row => row.id)
      .toSorted(),
    seededRows: {
      conversation_messages: messages.length,
      conversation_participants: participants.length,
      notification_push_intent_subscription_receipts:
        subscriptions.length + backgroundConversations * 100,
    },
    async cleanup() {
      await write(sql`/* cleanupConversationRetentionCapacity:conversations */
        DELETE FROM conversations WHERE id = ANY(${conversations.map(row => row.id)}::uuid[])`)
      await write(sql`/* cleanupConversationRetentionCapacity:subscriptions */
        DELETE FROM web_push_subscriptions WHERE user_id = ${seedUser.id}
          AND id = ANY(${subscriptions.map(row => row.id)}::uuid[])`)
    },
  }
}

function ownedIds(
  rows: readonly { id: string; conversation_id: string }[],
  conversationId: string,
) {
  return rows
    .filter(row => row.conversation_id === conversationId)
    .map(row => row.id)
    .toSorted()
}
