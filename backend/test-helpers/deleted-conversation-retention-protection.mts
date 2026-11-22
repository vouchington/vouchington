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
       VALUES ($1::uuid, $2::uuid, 'system', '{"text":"retained child"}'::jsonb)`,
      [conversation.id, conversation.userId],
    )
  }
  return conversation
}
