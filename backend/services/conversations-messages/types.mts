import type { AgentModelProvider } from '@voucha/types/entities/agent-model'
import type { Conversation } from '@voucha/types/entities/conversation'

export type { Conversation }

/** Stored shape of conversation_messages.content (JSON). */
export type ConversationMessageContent =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; error?: string }

export type ConversationMessage = {
  id: string
  conversation_id: string
  created_at: Date
  created_by_id: string | null
  updated_at: Date
  updated_by_id: string | null
  deleted_at: Date | null
  deleted_by_id: string | null
  content: unknown
}

export type ConversationMessageAgenticRun = {
  id: string
  conversation_id: string
  conversation_message_id: string
  /** Non-null when this run was spawned by an orchestrator subagent delegation. */
  parent_agentic_run_id: string | null
  model_name: string
  model_provider: AgentModelProvider
  status: ConversationMessageAgenticRunStatus
  termination_reason: ConversationMessageAgenticRunTerminationReason | null
  input: unknown
  output: unknown | null
  error: unknown | null
  started_at: Date
  completed_at: Date | null
  failed_at: Date | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

type ConversationMessageAgenticRunStatus = 'running' | 'completed' | 'failed'

export type ConversationMessageAgenticRunTerminationReason =
  | 'no_tool_calls'
  | 'max_topics'
  | 'max_iterations'
  | 'stalled'
  | 'error'

export type ConversationMessageAgenticRunEventType = 'function_call' | 'model_response'

export type ConversationMessageAgenticRunEvent = {
  id: string
  conversation_message_agentic_run_id: string
  type: ConversationMessageAgenticRunEventType
  input: unknown
  output: unknown | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}
