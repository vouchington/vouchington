import type { AgentModelProvider } from '@voucha/types/entities/agent-model'
import type { Conversation } from '@voucha/types/entities/conversation'

export type { Conversation }

/** Stored shape of conversation_messages.content (JSON). */
export type ConversationMessageContent =
  | { role: 'user'; content: string; turn_key?: string }
  | {
      role: 'assistant'
      content: string | null
      error?: string
      turn_key?: string
      /** Client-generated completion metadata; absent on messages that were not client-generated. */
      model_provider?: AgentModelProvider
      model_name?: string
    }

export type ConversationMessage = {
  id: string
  conversation_id: string
  created_at: Date
  created_by_id: string | null
  updated_at: Date
  updated_by_id: string | null
  deleted_at: Date | null
  deleted_by_id: string | null
  content: ConversationMessageContent | null
}
