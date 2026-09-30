import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentModelProvider } from '@voucha/types/entities/agent-model'
import { appendConversationMessageReturning } from './chat-content.mts'
import { lockConversationAndAssertNoActiveChatTurn } from './chat-turns.mts'
import type { ConversationMessage } from './types.mts'

export class ClientGeneratedTurnIdentityConflictError extends Error {
  constructor() {
    super('Message identity is already used by a different turn')
  }
}

type ClientGeneratedChatModelProvider = Extract<
  AgentModelProvider,
  'apple_foundation' | 'windows_foundry' | 'android_aicore' | 'openai_compatible'
>

export async function createClientGeneratedChatTurn(params: {
  conversationId: string
  userMessageId: string
  assistantMessageId: string
  createdById: string
  message: string
  assistantContent: string
  modelProvider: ClientGeneratedChatModelProvider
  modelName: string
}): Promise<{
  userMessage: ConversationMessage
  assistantMessage: ConversationMessage
}> {
  const { conversationId, createdById, message, assistantContent, modelProvider, modelName } =
    params
  const { userMessageId, assistantMessageId } = params

  await using query = await beginTransaction()
  // Serialize identity lookup with insertion; retries precede the active-turn guard.
  await query(sql`/* lockClientGeneratedTurn */
    SELECT id FROM conversations WHERE id = ${conversationId} FOR UPDATE
  `)
  const existing = await query<ConversationMessage>(sql`/* replayClientGeneratedTurn */
    SELECT id, conversation_id, created_at, created_by_id, updated_at, updated_by_id,
      deleted_at, deleted_by_id, content
    FROM conversation_messages
    WHERE conversation_id = ${conversationId}
      AND id IN (${userMessageId}, ${assistantMessageId})
  `)
  if (existing.rows.length > 0) {
    const userMessage = existing.rows.find(row => row.id === userMessageId)
    const assistantMessage = existing.rows.find(row => row.id === assistantMessageId)
    if (
      !userMessage ||
      !assistantMessage ||
      userMessage.deleted_at ||
      assistantMessage.deleted_at ||
      userMessage.created_by_id !== createdById ||
      assistantMessage.created_by_id !== createdById ||
      userMessage.content?.role !== 'user' ||
      userMessage.content.content !== message ||
      assistantMessage.content?.role !== 'assistant' ||
      assistantMessage.content.content !== assistantContent
    ) {
      throw new ClientGeneratedTurnIdentityConflictError()
    }
    await query.commit()
    return { userMessage, assistantMessage }
  }
  await lockConversationAndAssertNoActiveChatTurn(query, conversationId)
  const userInsert = sql`/* createClientGeneratedChatTurnUser */
    INSERT INTO conversation_messages (id, conversation_id, created_by_id, content)
    VALUES (${userMessageId}, ${conversationId}, ${createdById}, ${JSON.stringify({ role: 'user', content: message })})
    RETURNING
  `
  appendConversationMessageReturning(userInsert)
  const userMessageResult = await query<ConversationMessage>(userInsert)
  const userMessage = userMessageResult.rows[0]!

  const assistantInsert = sql`/* createClientGeneratedChatTurnAssistant */
    INSERT INTO conversation_messages (id, conversation_id, created_by_id, content)
    VALUES (${assistantMessageId}, ${conversationId}, ${createdById}, ${JSON.stringify({
      role: 'assistant',
      content: assistantContent,
    })})
    RETURNING
  `
  appendConversationMessageReturning(assistantInsert)
  const assistantMessageResult = await query<ConversationMessage>(assistantInsert)
  const assistantMessage = assistantMessageResult.rows[0]!

  await query(sql`/* clearClientGeneratedChatLastResponseId */
    UPDATE conversations
    SET last_response_id = NULL
    WHERE id = ${conversationId}
  `)

  await query(sql`/* createClientGeneratedChatTurnRun */
    INSERT INTO conversation_message_agentic_runs
      (
        conversation_id,
        conversation_message_id,
        model_name,
        model_provider,
        input,
        output,
        termination_reason,
        completed_at
      )
    VALUES
      (
        ${conversationId},
        ${assistantMessage.id},
        ${modelName},
        ${modelProvider},
        ${JSON.stringify({ message })},
        ${JSON.stringify({ response: assistantContent })},
        'no_tool_calls',
        CURRENT_TIMESTAMP
      )
  `)

  const result = {
    userMessage,
    assistantMessage,
  }

  await query.commit()
  return result
}
