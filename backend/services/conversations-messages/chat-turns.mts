import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ConversationMessage } from './types.mts'

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
        WHERE cmar.conversation_message_id = cm.id
          AND cmar.deleted_at IS NULL
      )
    LIMIT 1
  `)
  if (activeTurnResult.rows.length > 0) throw new ChatTurnConflictError()
}

export async function createHostedChatTurn(params: {
  conversationId: string
  createdById: string
  message: string
}): Promise<{
  userMessage: ConversationMessage
  assistantMessage: ConversationMessage
}> {
  const { conversationId, createdById, message } = params
  await using query = await beginTransaction()
  await lockConversationAndAssertNoActiveChatTurn(query, conversationId)

  const userMessageResult = await query<ConversationMessage>(sql`/* createHostedChatTurnUser */
    INSERT INTO conversation_messages (conversation_id, created_by_id, content)
    VALUES (${conversationId}, ${createdById}, ${JSON.stringify({ role: 'user', content: message })})
    RETURNING *
  `)
  const assistantMessageResult =
    await query<ConversationMessage>(sql`/* createHostedChatTurnAssistant */
    INSERT INTO conversation_messages (conversation_id, created_by_id, content)
    VALUES (${conversationId}, ${createdById}, ${JSON.stringify({ role: 'assistant', content: null })})
    RETURNING *
  `)

  const result = {
    userMessage: userMessageResult.rows[0]!,
    assistantMessage: assistantMessageResult.rows[0]!,
  }

  await query.commit()
  return result
}
