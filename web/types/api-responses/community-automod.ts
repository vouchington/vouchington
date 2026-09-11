import type * as Api from './shared'

type PageInfo = Api.PageInfo

interface BufferJSON {
  type: 'Buffer'
  data: number[]
}

export type CommunityAutomodActionSourceType =
  | 'agent_moderation'
  | 'openai_omni'
  | 'spam_detection'
  | 'community_prompt'

export type CommunityAutomodActionCurrentState = 'rejected' | 'in_review' | 'unpublished'

export type CommunityAutomodTrainingLabel =
  | 'true_positive'
  | 'false_positive'
  | 'false_negative_candidate'
  | 'true_negative'
  | 'accepted'
  | 'edited'
  | 'rejected'
  | 'not_applicable'

export interface CommunityAutomodFeedbackInput {
  outcome: Extract<CommunityAutomodTrainingLabel, 'false_positive' | 'true_positive'>
  action: 'reinstate' | 'keep_removed' | 'label_only'
  reason_code?: string | null
  note?: string | null
}

export interface CommunityAutomodFeedbackResponseBody {
  applied_action: boolean
  feedback: {
    actor_user_id: string
    agent_moderation_id: string | null
    applied_action: boolean
    community_id: string
    created_at: string
    event_type: string
    human_action: string
    id: string
    input_sha256: string | BufferJSON | null
    label: CommunityAutomodTrainingLabel
    label_confidence: number
    metadata: Record<string, unknown>
    moderation_appeal_id: string | null
    moderation_report_id: string | null
    note: string | null
    post_clearance_change_id: string | null
    post_id: string | null
    reason_code: string | null
    review_dispute_id: string | null
    source_type: CommunityAutomodActionSourceType
    updated_at: string
  }
}

export interface CommunityAutomodAction {
  source_key: string
  source_type: CommunityAutomodActionSourceType
  post_id: string
  community_id: string
  agent_moderation_id: string | null
  moderator_slug: string | null
  title: string
  authored_title: string | null
  declared_language: string | null
  lingua_rs_detected_language: string | null
  markdown_preview: string
  post_type: string
  post_href: string
  created_at: string
  action_at: string
  confidence_score: number | null
  flagged: boolean
  reason: string | null
  categories: string[]
  model_output: unknown
  current_state: CommunityAutomodActionCurrentState
  feedback_label: CommunityAutomodTrainingLabel | null
}

export interface CommunityAutomodActionsResponseBody {
  automod_actions: CommunityAutomodAction[]
  stats: {
    total_count: number
    false_positive_count: number
    false_positive_rate: number
  }
  page_info: Pick<PageInfo, 'has_next_page' | 'end_cursor'>
}

export interface CommunityAutomodSimulationResult {
  post_id: string
  title: string
  declared_language: string | null
  lingua_rs_detected_language: string | null
  post_type: string
  approved_at: string
  content_excerpt: string
  flagged: boolean
  reason: string
  would_unpublish: boolean
}

export interface CommunityAutomodSimulation {
  prompt_id: string
  time_window_hours: number
  sample_count: number
  would_flag_count: number
  would_unpublish_count: number
  false_positive_estimate: {
    historical_flagged_count: number
    historical_approved_count: number
    rate: number | null
  } | null
}

export interface CommunityAutomodSimulationResponseBody {
  simulation: CommunityAutomodSimulation
  results: CommunityAutomodSimulationResult[]
}
