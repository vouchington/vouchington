import type { TransactionQuery } from '@data-stores/psql'
import type { DeletedConversationFixture } from './deleted-conversation-retention.mts'

export async function lockDeletedConversationNotificationForTest(
  query: TransactionQuery,
  conversation: DeletedConversationFixture,
): Promise<void> {
  if (!conversation.notificationId) throw new Error('Fixture has no notification to lock')
  await query(
    `/* lockDeletedConversationNotificationForTest */
     SELECT 1 FROM notifications
     WHERE user_id = $1::uuid AND id = $2::uuid FOR UPDATE`,
    [conversation.userId, conversation.notificationId],
  )
}

export async function deleteDeletedConversationFixtureForTest(
  query: TransactionQuery,
  conversation: DeletedConversationFixture,
): Promise<void> {
  await query(
    `/* deleteDeletedConversationFixtureForTest */
     DELETE FROM conversations WHERE id = $1::uuid`,
    [conversation.id],
  )
  await query(
    `/* deleteDeletedConversationUserFixtureForTest */
     DELETE FROM users WHERE id = $1::uuid`,
    [conversation.userId],
  )
}
