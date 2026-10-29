import type { TransactionQuery } from '@data-stores/psql'

export async function getNotificationPushIntentConversationForTest(
  query: TransactionQuery,
  userId: string,
  notificationId: string,
): Promise<string | null> {
  const { rows } = await query<{ conversation_id: string | null }>(
    `/* getNotificationPushIntentConversationForTest */
     SELECT conversation_id FROM notification_push_intents
     WHERE user_id = $1::uuid AND notification_id = $2::uuid`,
    [userId, notificationId],
  )
  return rows[0]?.conversation_id ?? null
}

export async function attemptNotificationPushIntentConversationChangeForTest(
  query: TransactionQuery,
  userId: string,
  notificationId: string,
  conversationId: string | null,
): Promise<string | null> {
  // Expected SQL errors must use the borrowed client: TransactionQuery marks
  // its session failed even after a PostgreSQL savepoint rollback.
  const client = query.client
  await client.query('/* pushContextSavepoint */ SAVEPOINT push_context_test')
  try {
    await client.query(
      `/* attemptNotificationPushIntentConversationChangeForTest */
       UPDATE notification_push_intents SET conversation_id = $3::uuid
       WHERE user_id = $1::uuid AND notification_id = $2::uuid`,
      [userId, notificationId, conversationId],
    )
    await client.query('/* pushContextRelease */ RELEASE SAVEPOINT push_context_test')
    return null
  } catch (err) {
    await client.query('/* pushContextRollback */ ROLLBACK TO SAVEPOINT push_context_test')
    await client.query('/* pushContextRelease */ RELEASE SAVEPOINT push_context_test')
    return String(err)
  }
}

export async function moveNotificationConversationForTest(
  query: TransactionQuery,
  userId: string,
  notificationId: string,
  conversationId: string,
): Promise<string | null> {
  const client = query.client
  await client.query('/* notificationContextSavepoint */ SAVEPOINT notification_context_test')
  try {
    await client.query(
      `/* moveNotificationConversationForTest */
       UPDATE notifications SET conversation_id = $3::uuid
       WHERE user_id = $1::uuid AND id = $2::uuid`,
      [userId, notificationId, conversationId],
    )
    await client.query(
      '/* notificationContextRelease */ RELEASE SAVEPOINT notification_context_test',
    )
    return null
  } catch (err) {
    await client.query(
      '/* notificationContextRollback */ ROLLBACK TO SAVEPOINT notification_context_test',
    )
    await client.query(
      '/* notificationContextRelease */ RELEASE SAVEPOINT notification_context_test',
    )
    return String(err)
  }
}
