import type { ElectionVote } from './posts'
import type { AgentModerationResults } from '@voucha/types'

export type { AgentModerationResults }

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
