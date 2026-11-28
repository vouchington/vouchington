import type { TransactionQuery } from '@data-stores/psql'

export async function lockDeletedConversationIntentForTest(
  query: TransactionQuery,
  userId: string,
  notificationId: string,
): Promise<void> {
  await query(
    `/* lockDeletedConversationIntentForTest */
     SELECT 1 FROM notification_push_intents
     WHERE user_id = $1::uuid AND notification_id = $2::uuid FOR UPDATE`,
    [userId, notificationId],
  )
}

export async function lockDeletedConversationNotificationForTest(
  query: TransactionQuery,
  userId: string,
  notificationId: string,
): Promise<void> {
  await query(
    `/* lockDeletedConversationNotificationForTest */
     SELECT 1 FROM notifications
     WHERE user_id = $1::uuid AND id = $2::uuid FOR UPDATE`,
    [userId, notificationId],
  )
}

export async function deleteLockedConversationAndUserForTest(
  query: TransactionQuery,
  conversationId: string,
  userId: string,
): Promise<void> {
  await query(
    '/* deleteLockedConversationForTest */ DELETE FROM conversations WHERE id = $1::uuid',
    [conversationId],
  )
  await query('/* deleteLockedConversationUserForTest */ DELETE FROM users WHERE id = $1::uuid', [
    userId,
  ])
}
