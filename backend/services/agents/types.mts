import type { AgentModel, AgentModelProvider } from '@voucha/types/entities/agent-model'

export type AgentType = 'moderator' | 'autotagger' | 'storyteller'

export type { AgentModel, AgentModelProvider }

export type Agent = {
  id: string
  system_user_id: string
  agent_type: AgentType
  activated_at: Date | null
  deactivated_at: Date | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export type AgentModerator = {
  agent_id: string
  created_at: Date
  updated_at: Date
}

export type AgentPrompt = {
  id: string
  prompt: string
  agent_id: string
  model_name: AgentModel
  model_provider: AgentModelProvider
  created_at: Date
  updated_at: Date
  activated_at: Date | null
  deactivated_at: Date | null
  deleted_at: Date | null
}
