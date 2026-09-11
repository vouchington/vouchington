import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentModelProvider } from '@voucha/types/entities/agent-model'
import { lockConversationAndAssertNoActiveChatTurn } from './chat-turns.mts'
import type { ConversationMessage, ConversationMessageAgenticRun } from './types.mts'

type ClientGeneratedChatModelProvider = Extract<
  AgentModelProvider,
  'apple_foundation' | 'windows_foundry' | 'android_aicore' | 'openai_compatible'
>

export async function createClientGeneratedChatTurn(params: {
  conversationId: string
  createdById: string
  message: string
  assistantContent: string
  modelProvider: ClientGeneratedChatModelProvider
  modelName: string
}): Promise<{
  userMessage: ConversationMessage
  assistantMessage: ConversationMessage
  agenticRun: ConversationMessageAgenticRun
}> {
  const { conversationId, createdById, message, assistantContent, modelProvider, modelName } =
    params

  await using query = await beginTransaction()
  await lockConversationAndAssertNoActiveChatTurn(query, conversationId)
  const userMessageResult =
    await query<ConversationMessage>(sql`/* createClientGeneratedChatTurnUser */
    INSERT INTO conversation_messages (conversation_id, created_by_id, content)
    VALUES (${conversationId}, ${createdById}, ${JSON.stringify({ role: 'user', content: message })})
    RETURNING *
  `)
  const userMessage = userMessageResult.rows[0]!

  const assistantMessageResult =
    await query<ConversationMessage>(sql`/* createClientGeneratedChatTurnAssistant */
    INSERT INTO conversation_messages (conversation_id, created_by_id, content)
    VALUES (${conversationId}, ${createdById}, ${JSON.stringify({
      role: 'assistant',
      content: assistantContent,
    })})
    RETURNING *
  `)
  const assistantMessage = assistantMessageResult.rows[0]!

  await query(sql`/* clearClientGeneratedChatLastResponseId */
    UPDATE conversations
    SET last_response_id = NULL
    WHERE id = ${conversationId}
  `)

  const agenticRunResult =
    await query<ConversationMessageAgenticRun>(sql`/* createClientGeneratedChatTurnRun */
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
    RETURNING
      id,
      conversation_id,
      conversation_message_id,
      parent_agentic_run_id,
      model_name,
      model_provider,
      input,
      output,
      error,
      CASE
        WHEN failed_at IS NOT NULL THEN 'failed'
        WHEN completed_at IS NOT NULL THEN 'completed'
        ELSE 'running'
      END AS status,
      termination_reason,
      started_at,
      completed_at,
      failed_at,
      created_at,
      updated_at,
      deleted_at
  `)

  const result = {
    userMessage,
    assistantMessage,
    agenticRun: agenticRunResult.rows[0]!,
  }

  await query.commit()
  return result
}
