import { createHash } from 'node:crypto'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { AgentModelProvider } from '@voucha/types/entities/agent-model'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { appendConversationMessageReturning } from './chat-content.mts'
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

type ClientGeneratedChatTurnParams = {
  conversationId: string
  userMessageId: string
  assistantMessageId: string
  createdById: string
  /** Recorded on both stored messages; not part of the turn identity, so a retry replays it. */
  provenance: ContentProvenance
  message: string
  assistantContent: string
  modelProvider: ClientGeneratedChatModelProvider
  modelName: string
}

export async function createClientGeneratedChatTurn(
  params: ClientGeneratedChatTurnParams,
): Promise<{
  userMessage: ConversationMessage
  assistantMessage: ConversationMessage
}> {
  const {
    conversationId,
    userMessageId,
    assistantMessageId,
    createdById,
    provenance,
    message,
    assistantContent,
    modelProvider,
    modelName,
  } = params
  const turnKey = getTurnKey(params)

  await using query = await beginTransaction()
  // Serialize identity lookup with insertion so concurrent retries replay one persisted turn.
  await query(sql`/* lockClientGeneratedTurn */
    SELECT id FROM conversations WHERE id = ${conversationId} FOR UPDATE
  `)
  const replay = await findClientGeneratedChatTurnReplay(query, params)
  if (replay) {
    await query.commit()
    return replay
  }
  const userInsert = sql`/* createClientGeneratedChatTurnUser */
    INSERT INTO conversation_messages (
      id, conversation_id, created_by_id, created_via, created_via_oauth_client_id, content
    )
    VALUES (
      ${userMessageId}, ${conversationId}, ${createdById}, ${provenance.createdVia},
      ${provenance.oauthClientId},
      ${JSON.stringify({ role: 'user', content: message, turn_key: turnKey })}
    )
    RETURNING
  `
  appendConversationMessageReturning(userInsert)
  const userMessageResult = await query<ConversationMessage>(userInsert)
  const userMessage = userMessageResult.rows[0]!

  const assistantInsert = sql`/* createClientGeneratedChatTurnAssistant */
    INSERT INTO conversation_messages (
      id, conversation_id, created_by_id, created_via, created_via_oauth_client_id, content
    )
    VALUES (
      ${assistantMessageId}, ${conversationId}, ${createdById}, ${provenance.createdVia},
      ${provenance.oauthClientId},
      ${JSON.stringify({
        role: 'assistant',
        content: assistantContent,
        turn_key: turnKey,
        model_provider: modelProvider,
        model_name: modelName,
      })}
    )
    RETURNING
  `
  appendConversationMessageReturning(assistantInsert)
  const assistantMessageResult = await query<ConversationMessage>(assistantInsert)
  const assistantMessage = assistantMessageResult.rows[0]!

  await query(sql`/* touchClientGeneratedChatConversation */
    UPDATE conversations
    SET last_activity_at = CURRENT_TIMESTAMP
    WHERE id = ${conversationId}
  `)

  const result = {
    userMessage,
    assistantMessage,
  }

  await query.commit()
  return result
}

/** Read an acknowledged turn before invoking safety providers again on a retry. */
export async function getClientGeneratedChatTurnReplay(params: ClientGeneratedChatTurnParams) {
  return findClientGeneratedChatTurnReplay(write, params)
}

async function findClientGeneratedChatTurnReplay(
  query: TransactionQuery | typeof write,
  params: ClientGeneratedChatTurnParams,
) {
  const { conversationId, userMessageId, assistantMessageId } = params
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
    if (!userMessage || !assistantMessage || !isSameTurn(userMessage, assistantMessage, params)) {
      throw new ClientGeneratedTurnIdentityConflictError()
    }
    return { userMessage, assistantMessage }
  }
  return undefined
}

/**
 * The turn key is the opaque identity of the message-id pair. A retry must also repeat every value
 * the client supplied, including the completion model, or it conflicts instead of replaying.
 */
function isSameTurn(
  userMessage: ConversationMessage,
  assistantMessage: ConversationMessage,
  params: ClientGeneratedChatTurnParams,
): boolean {
  const turnKey = getTurnKey(params)
  const user = userMessage.content
  const assistant = assistantMessage.content
  return (
    !userMessage.deleted_at &&
    !assistantMessage.deleted_at &&
    userMessage.created_by_id === params.createdById &&
    assistantMessage.created_by_id === params.createdById &&
    user?.role === 'user' &&
    user.turn_key === turnKey &&
    user.content === params.message &&
    assistant?.role === 'assistant' &&
    assistant.turn_key === turnKey &&
    assistant.content === params.assistantContent &&
    assistant.model_provider === params.modelProvider &&
    assistant.model_name === params.modelName
  )
}

function getTurnKey(params: ClientGeneratedChatTurnParams): string {
  return createHash('sha256')
    .update(`${params.userMessageId}:${params.assistantMessageId}`)
    .digest('hex')
}
