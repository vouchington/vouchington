import type { AgentModel, AgentModelProvider } from '@voucha/types/entities/agent-model'
// SupportMessage/SupportMessageDirection relocated to @voucha/types (pure data shapes, no
// service dependencies) so that backend/services/bedrock-embeddings can reference them without
// creating a bedrock-embeddings -> customer-support workspace cycle. Re-exported here for
// call-site stability, and imported locally for use by SupportRagResult below.
import type {
  SupportMessage,
  SupportMessageDirection,
} from '@voucha/types/entities/support-message'

export type SupportContact = {
  id: string
  email_address: string
  name: string
  user_id: string | null
  notes: string
  created_at: Date
  updated_at: Date
}

export type SupportThread = {
  id: string
  support_contact_id: string
  subject: string
  conversation_id: string | null
  created_at: Date
  updated_at: Date
  assigned_at: Date | null
  assigned_to_id: string | null
  resolved_at: Date | null
  resolved_by_id: string | null
  status: 'open' | 'assigned' | 'resolved'
}

export type SupportThreadWithStatus = SupportThread & {
  contact_user_id: string | null
}

export type { SupportMessage, SupportMessageDirection }

export type SupportAgentRunStatus = 'running' | 'completed' | 'failed'
export type SupportAgentRunTerminationReason =
  | 'no_tool_calls'
  | 'max_iterations'
  | 'stalled'
  | 'superseded'
  | 'error'

export type SupportAgentRun = {
  id: string
  support_thread_id: string
  support_message_id: string
  claim_token: string | null
  model_name: AgentModel
  model_provider: AgentModelProvider
  input: unknown
  output: unknown | null
  error: unknown | null
  status: SupportAgentRunStatus
  termination_reason: SupportAgentRunTerminationReason | null
  started_at: Date
  completed_at: Date | null
  failed_at: Date | null
  created_at: Date
  updated_at: Date
}

export type SupportRagResult = {
  id: string
  thread_id: string
  thread_subject: string
  contact_name: string
  contact_email: string
  direction: SupportMessageDirection
  body_text: string
  created_at: Date
}
