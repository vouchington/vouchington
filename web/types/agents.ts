import type { ElectionVote } from './posts'
import type { AgentModerationResults } from '@voucha/types'
import type { PageInfo } from '@voucha/types/pagination'

export type { AgentModerationResults }

export type AgentType = 'moderator' | 'autotagger' | 'storyteller' | 'recommender'

export interface AgentModeration {
  id: string
  post_id: string
  prompt_id: string
  agent_id: string
  moderator_slug: string | null
  flagged: boolean
  results: AgentModerationResults
  input_sha256: string
  created_at: string
  updated_at: string
}

export interface AgentModerationElection {
  __entity_type: 'agent_moderation_election'
  id: string
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

export type AgentModerationVote = ElectionVote

export interface Agent {
  id: string
  system_user_id: string
  agent_type: AgentType
  activated_at: string | null
  deactivated_at: string | null
  created_at: string
  updated_at: string
  slug?: string
  moderator?: {
    agent_id: string
  }
}

interface AgentSearchResult {
  id: string
  system_user_id: string
  agent_type: AgentType
  activated_at: string | null
  deactivated_at: string | null
  created_at: string
}

export interface AgentResponseBody {
  agent: Agent
  user: AgentUser | null
}

export interface AgentUser {
  id: string
  username?: string
  display_account?: { id?: string; name: string | null } | null
}

export interface AgentsResponseBody {
  results: AgentSearchResult[]
  page_info: PageInfo
  users: Record<string, AgentUser>
}

interface AgentConversationResult {
  id: string
  title: string
  created_at: string
  created_by_id: string
}

export interface AgentConversationsResponseBody {
  results: AgentConversationResult[]
  page_info: PageInfo
  users: Record<string, AgentUser>
}

export interface ConversationMessage {
  id: string
  conversation_id: string
  created_at: string
  created_by_id: string
  content: { role: 'user' | 'assistant'; content: string | null; error?: string } | null
}

export interface AgentConversationDetailResponseBody {
  conversation: {
    id: string
    title: string
    created_at: string
    created_by_id: string
  }
  results: ConversationMessage[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}
