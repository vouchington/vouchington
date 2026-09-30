import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export class ChatTurnConflictError extends Error {
  constructor() {
    super('A message is already being processed')
  }
}

export async function lockConversationAndAssertNoActiveChatTurn(
  query: TransactionQuery,
  conversationId: string,
): Promise<void> {
  await query(sql`/* lockChatTurnConversation */
    SELECT id
    FROM conversations
    WHERE id = ${conversationId}
    FOR UPDATE
  `)

  const activeTurnResult = await query(sql`/* assertNoActiveChatTurn */
    SELECT 1
    FROM conversation_message_agentic_runs
    WHERE conversation_id = ${conversationId}
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND deleted_at IS NULL
    UNION ALL
    SELECT 1
    FROM conversation_messages cm
    WHERE cm.conversation_id = ${conversationId}
      AND cm.deleted_at IS NULL
      AND cm.content->>'role' = 'assistant'
      AND cm.content->>'content' IS NULL
      AND cm.content->>'error' IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM conversation_message_agentic_runs cmar
        WHERE cmar.conversation_id = cm.conversation_id
          AND cmar.conversation_message_id = cm.id
          AND cmar.deleted_at IS NULL
      )
    LIMIT 1
  `)
  if (activeTurnResult.rows.length > 0) throw new ChatTurnConflictError()
}
