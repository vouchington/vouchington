export type ModerationTrainingSourceType =
  | 'agent_moderation'
  | 'openai_omni'
  | 'spam_detection'
  | 'community_prompt'
  | 'community_review'
  | 'moderation_report'
  | 'moderation_appeal'
  | 'review_dispute'
  | 'agent_moderation_vote'
  | 'prompt_test_run'

export type ModerationTrainingEventType =
  | 'automod_reviewed'
  | 'manual_action_inferred'
  | 'report_resolved'
  | 'dispute_resolved'
  | 'appeal_resolved'
  | 'draft_edited'
  | 'agent_accuracy_voted'
  | 'prompt_test_labelled'

export type ModerationTrainingLabel =
  | 'true_positive'
  | 'false_positive'
  | 'false_negative_candidate'
  | 'true_negative'
  | 'accepted'
  | 'edited'
  | 'rejected'
  | 'not_applicable'

export type ModerationTrainingFeedback = {
  id: string
  source_type: ModerationTrainingSourceType
  event_type: ModerationTrainingEventType
  label: ModerationTrainingLabel
  human_action: string
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

export type RecordModerationTrainingFeedbackInput = {
  sourceType: ModerationTrainingSourceType
  eventType: ModerationTrainingEventType
  label: ModerationTrainingLabel
  humanAction: string
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
  flagged: boolean
  reason: string | null
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
