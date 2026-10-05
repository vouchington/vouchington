import type { FiniteValue } from '@data-stores/psql/finite-values/index'

export type ModerationTrainingSourceType = FiniteValue<'moderation_training_source_types'>

export type ModerationTrainingEventType = FiniteValue<'moderation_training_event_types'>

export type ModerationTrainingLabel = FiniteValue<'moderation_training_labels'>

export type ModerationTrainingFeedback = {
  id: string
  source_type: ModerationTrainingSourceType
  event_type: ModerationTrainingEventType
  label: ModerationTrainingLabel
  human_action: FiniteValue<'moderation_training_human_actions'>
  reason_code: string | null
  note: string | null
  label_confidence: number
  actor_user_id: string | null
  community_id: string | null
  post_id: string | null
  agent_moderation_id: string | null
  moderation_report_id: string | null
  moderation_appeal_id: string | null
  review_dispute_id: string | null
  post_clearance_change_id: string | null
  input_sha256: Buffer | null
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

export type ModerationTrainingEvidence = 'staff_or_user' | 'agent'

export type RecordModerationTrainingFeedbackInput = {
  trainingEvidence: ModerationTrainingEvidence
  sourceType: ModerationTrainingSourceType
  eventType: ModerationTrainingEventType
  label: ModerationTrainingLabel
  humanAction: FiniteValue<'moderation_training_human_actions'>
  reasonCode?: string | null
  note?: string | null
  labelConfidence?: number
  actorUserId?: string | null
  communityId?: string | null
  postId?: string | null
  agentModerationId?: string | null
  moderationReportId?: string | null
  moderationAppealId?: string | null
  reviewDisputeId?: string | null
  postClearanceChangeId?: string | null
  inputSha256?: Buffer | null
  metadata?: Record<string, unknown>
}

export type RecentAutomodActionSourceType =
  | 'agent_moderation'
  | 'openai_omni'
  | 'spam_detection'
  | 'community_prompt'

export type RecentAutomodAction = {
  source_key: string
  source_type: RecentAutomodActionSourceType
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
  created_at: Date
  action_at: Date
  confidence_score: number | null
  is_flagged: boolean
  categories: string[]
  model_output: unknown
  current_state: 'rejected' | 'in_review' | 'unpublished'
  feedback_label: ModerationTrainingLabel | null
}

export type SearchRecentAutomodActionsOptions = {
  windowHours?: number
  limit?: number
  after?: string | null
  sourceType?: RecentAutomodActionSourceType | null
  agentSlug?: string | null
  postType?: string | null
  maxConfidence?: number | null
}

export type SearchRecentAutomodActionsResult = {
  actions: RecentAutomodAction[]
  hasNextPage: boolean
  endCursor: string | null
  stats: {
    total_count: number
    false_positive_count: number
    false_positive_rate: number
  }
}
