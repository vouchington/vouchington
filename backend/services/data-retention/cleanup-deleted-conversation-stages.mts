export type ChildStage = { deletion: string; remaining: string }

// Descendants are removed bottom-up. Each statement deletes at most one configured page, so an
// unusually large chat cannot turn one parent DELETE into unbounded message or push work.
export const CHILD_STAGES: readonly ChildStage[] = [
  {
    deletion: `/* deleteConversationPushReceiptPage */
      WITH page AS (
        SELECT receipt.user_id, receipt.notification_id, receipt.subscription_id
        FROM notifications notification
        JOIN notification_push_intent_subscription_receipts receipt
          ON receipt.user_id = notification.user_id
         AND receipt.notification_id = notification.id
        WHERE notification.conversation_id = $1::uuid
        ORDER BY receipt.user_id, receipt.notification_id, receipt.subscription_id
        LIMIT $2 FOR UPDATE OF receipt SKIP LOCKED
      )
      DELETE FROM notification_push_intent_subscription_receipts receipt
      USING page WHERE (receipt.user_id, receipt.notification_id, receipt.subscription_id)
        = (page.user_id, page.notification_id, page.subscription_id)`,
    remaining: `/* hasConversationPushReceipts */
      SELECT EXISTS (
        SELECT 1 FROM notifications notification
        JOIN notification_push_intent_subscription_receipts receipt
          ON receipt.user_id = notification.user_id
         AND receipt.notification_id = notification.id
        WHERE notification.conversation_id = $1::uuid LIMIT 1
      ) AS remaining`,
  },
  {
    deletion: `/* deleteConversationPushIntentPage */
      WITH page AS (
        SELECT intent.user_id, intent.notification_id
        FROM notifications notification
        JOIN notification_push_intents intent
          ON intent.user_id = notification.user_id
         AND intent.notification_id = notification.id
        WHERE notification.conversation_id = $1::uuid
          AND intent.status IN ('delivered', 'suppressed')
        ORDER BY intent.user_id, intent.notification_id
        LIMIT $2 FOR UPDATE OF intent SKIP LOCKED
      )
      DELETE FROM notification_push_intents intent
      USING page WHERE (intent.user_id, intent.notification_id)
        = (page.user_id, page.notification_id)`,
    remaining: `/* hasConversationPushIntents */
      SELECT EXISTS (
        SELECT 1 FROM notifications notification
        JOIN notification_push_intents intent
          ON intent.user_id = notification.user_id
         AND intent.notification_id = notification.id
        WHERE notification.conversation_id = $1::uuid LIMIT 1
      ) AS remaining`,
  },
  {
    deletion: `/* deleteConversationNotificationPage */
      WITH page AS (
        SELECT notification.user_id, notification.id
        FROM notifications notification
        WHERE notification.conversation_id = $1::uuid
        ORDER BY notification.user_id, notification.id
        LIMIT $2 FOR UPDATE OF notification SKIP LOCKED
      )
      DELETE FROM notifications notification
      USING page WHERE (notification.user_id, notification.id) = (page.user_id, page.id)`,
    remaining: `/* hasConversationNotifications */
      SELECT EXISTS (
        SELECT 1 FROM notifications WHERE conversation_id = $1::uuid LIMIT 1
      ) AS remaining`,
  },
  {
    deletion: `/* deleteConversationMessagePage */
      WITH page AS (
        SELECT message.conversation_id, message.id
        FROM conversation_messages message
        WHERE message.conversation_id = $1::uuid
        ORDER BY message.conversation_id, message.id
        LIMIT $2 FOR UPDATE OF message SKIP LOCKED
      )
      DELETE FROM conversation_messages message
      USING page WHERE (message.conversation_id, message.id) = (page.conversation_id, page.id)`,
    remaining: `/* hasConversationMessages */
      SELECT EXISTS (
        SELECT 1 FROM conversation_messages WHERE conversation_id = $1::uuid LIMIT 1
      ) AS remaining`,
  },
  {
    deletion: `/* deleteConversationParticipantPage */
      WITH page AS (
        SELECT participant.conversation_id, participant.id
        FROM conversation_participants participant
        WHERE participant.conversation_id = $1::uuid
        ORDER BY participant.conversation_id, participant.id
        LIMIT $2 FOR UPDATE OF participant SKIP LOCKED
      )
      DELETE FROM conversation_participants participant
      USING page WHERE (participant.conversation_id, participant.id)
        = (page.conversation_id, page.id)`,
    remaining: `/* hasConversationParticipants */
      SELECT EXISTS (
        SELECT 1 FROM conversation_participants WHERE conversation_id = $1::uuid LIMIT 1
      ) AS remaining`,
  },
]
