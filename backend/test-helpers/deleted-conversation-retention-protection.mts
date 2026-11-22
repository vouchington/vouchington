import type { TransactionQuery } from '@data-stores/psql'
import {
  insertDeletedConversationFixtureForTest,
  type DeletedConversationFixture,
} from './deleted-conversation-retention.mts'

export type DeletedConversationProtection = 'receipt' | 'message'

/** The receipt path has its normal terminal push work; the message path owns only one child. */
export async function insertDeletedConversationProtectionForTest(
  query: TransactionQuery,
  kind: DeletedConversationProtection,
  deletedAt: Date,
): Promise<DeletedConversationFixture> {
  const conversation = await insertDeletedConversationFixtureForTest(query, {
    deletedAt,
    withChildren: kind === 'receipt',
  })
  if (kind === 'message') {
    await query(
      `/* insertProtectedConversationMessageForTest */
       INSERT INTO conversation_messages (conversation_id, created_by_id, created_via, content)
       VALUES ($1::uuid, $2::uuid, 'system', '{"text":"protected child"}'::jsonb)`,
      [conversation.id, conversation.userId],
    )
  }
  return conversation
}

/** A real independent row lock forces the production SKIP LOCKED page to preserve its parent. */
export async function lockDeletedConversationProtectionForTest(
  query: TransactionQuery,
  kind: DeletedConversationProtection,
  conversation: DeletedConversationFixture,
): Promise<void> {
  const result =
    kind === 'receipt'
      ? await query<{ subscription_id: string }>(
          `/* lockDeletedConversationReceiptForTest */
           SELECT subscription_id FROM notification_push_intent_subscription_receipts
           WHERE user_id = $1::uuid AND notification_id = $2::uuid
           ORDER BY subscription_id LIMIT 1 FOR UPDATE`,
          [conversation.userId, conversation.notificationId],
        )
      : await query<{ id: string }>(
          `/* lockDeletedConversationMessageForTest */
           SELECT id FROM conversation_messages WHERE conversation_id = $1::uuid
           ORDER BY id LIMIT 1 FOR UPDATE`,
          [conversation.id],
        )
  if (result.rows.length !== 1) throw new Error(`Fixture has no ${kind} to lock`)
}
