import type { Conversation, ConversationMessage } from './types.mts'

/** Public transcript data is independent of generation providers and execution records. */
export function toConversationTranscript(
  conversation: Pick<Conversation, 'id' | 'title' | 'created_at' | 'updated_at'>,
) {
  return {
    id: conversation.id,
    title: conversation.title,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
  }
}

export function toMessageTranscript(message: ConversationMessage) {
  const content = message.content
  const status: 'completed' | 'incomplete' | 'failed' =
    content?.role === 'assistant' && typeof content.error === 'string'
      ? 'failed'
      : content === null || content.content === null
        ? 'incomplete'
        : 'completed'
  return {
    id: message.id,
    conversation_id: message.conversation_id,
    content: content ? { role: content.role, content: content.content } : null,
    created_at: message.created_at,
    updated_at: message.updated_at,
    completion: { status },
  }
}
