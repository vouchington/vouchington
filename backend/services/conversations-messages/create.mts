import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentModel, AgentModelProvider } from '@voucha/types/entities/agent-model'
import { appendConversationMessageReturning, conversationMessageColumns } from './chat-content.mts'
import type {
  Conversation,
  ConversationMessage,
  ConversationMessageAgenticRun,
  ConversationMessageAgenticRunEvent,
  ConversationMessageAgenticRunEventType,
} from './types.mts'

export async function createConversation(createdById: string, title = ''): Promise<Conversation> {
  const { rows } = await write(sql`/* createConversation */
      INSERT INTO conversations (created_by_id, title)
      VALUES (${createdById}, ${title})
      RETURNING *
    `)
  return rows[0]!
}

export async function createConversationMessage(
  conversationId: string,
  createdById: string,
  content: unknown,
): Promise<ConversationMessage> {
  const columns = conversationMessageColumns(content)
  const query = sql`/* createConversationMessage */
    INSERT INTO conversation_messages (
      conversation_id, created_by_id, chat_role, chat_text, chat_error
    )
    VALUES (
      ${conversationId}, ${createdById}, ${columns.role}, ${columns.text}, ${columns.error}
    )
    RETURNING
  `
  appendConversationMessageReturning(query)
  const { rows } = await write<ConversationMessage>(query)
  return rows[0]!
}

export async function createConversationMessageAgenticRun(params: {
  conversationId: string
  conversationMessageId: string
  modelName: AgentModel
  modelProvider: AgentModelProvider
  input: unknown
  /** When this run is spawned by an orchestrator, provide the orchestrator's run ID. */
  parentAgenticRunId?: string
}): Promise<ConversationMessageAgenticRun> {
  const {
    conversationId,
    conversationMessageId,
    modelName,
    modelProvider,
    input,
    parentAgenticRunId = null,
  } = params
  const { rows } =
    await write<ConversationMessageAgenticRun>(sql`/* createConversationMessageAgenticRun */
    INSERT INTO conversation_message_agentic_runs
      (conversation_id, conversation_message_id, model_name, model_provider, input, parent_agentic_run_id)
    VALUES (
      ${conversationId}, ${conversationMessageId}, ${modelName}, ${modelProvider}, ${JSON.stringify(input)}, ${parentAgenticRunId}
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
  return rows[0]!
}

export async function claimChatConversationMessageAgenticRun(params: {
  conversationId: string
  conversationMessageId: string
  modelName: AgentModel
  modelProvider: AgentModelProvider
  input: unknown
}): Promise<{ id: string } | undefined> {
  await using query = await beginTransaction()

  await query(sql`/* lockChatConversationMessageAgenticRunClaim */
      SELECT pg_advisory_xact_lock(hashtextextended(${params.conversationMessageId}, 0))
    `)
  const placeholder = await query<{
    chat_role: string | null
    chat_text: string | null
    chat_error: string | null
  }>(sql`/* lockPendingChatAssistantPlaceholder */
      SELECT chat_role, chat_text, chat_error
      FROM conversation_messages
      WHERE conversation_id = ${params.conversationId}
        AND id = ${params.conversationMessageId}
        AND deleted_at IS NULL
      FOR UPDATE
    `)
  const pending = placeholder.rows[0]
  if (
    pending?.chat_role !== 'assistant' ||
    pending.chat_text !== null ||
    pending.chat_error !== null
  ) {
    await query.commit()
    return undefined
  }
  const { rows } = await query<{ id: string }>(sql`/* claimChatConversationMessageAgenticRun */
      INSERT INTO conversation_message_agentic_runs
        (conversation_id, conversation_message_id, model_name, model_provider, input)
      SELECT
        ${params.conversationId}, ${params.conversationMessageId}, ${params.modelName},
        ${params.modelProvider}, ${JSON.stringify(params.input)}
      WHERE NOT EXISTS (
        SELECT 1 FROM conversation_message_agentic_runs
        WHERE conversation_message_id = ${params.conversationMessageId}
          AND parent_agentic_run_id IS NULL
          AND deleted_at IS NULL
      )
      RETURNING id
    `)
  await query.commit()
  return rows[0]
}

export async function createConversationMessageAgenticRunEvent(params: {
  conversationMessageAgenticRunId: string
  type: ConversationMessageAgenticRunEventType
  input: unknown
}): Promise<ConversationMessageAgenticRunEvent> {
  const { conversationMessageAgenticRunId, type, input } = params
  const { rows } = await write(sql`/* createConversationMessageAgenticRunEvent */
    INSERT INTO conversation_message_agentic_runs_events
      (conversation_message_agentic_run_id, type, input)
    VALUES
      (${conversationMessageAgenticRunId}, ${type}, ${JSON.stringify(input)})
    RETURNING *
  `)
  return rows[0]
}
