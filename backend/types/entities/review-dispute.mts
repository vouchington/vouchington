import type {
  ReviewDisputeAction,
  ReviewDisputeRecommendedAction,
  ReviewDisputeReason,
  ReviewDisputeStatus,
} from '@ts-shared/utils/moderation-catalogs'

export interface ReviewDispute {
  id: string
  post_id: string
  topic_id: string
  disputant_user_id: string
  reason: ReviewDisputeReason
  claim_text: string
  status: ReviewDisputeStatus
  recommended_action: ReviewDisputeRecommendedAction | null
  /** Derived: true when the appeal has been pending longer than DISPUTE_SLA_HOURS */
  is_overdue?: boolean
  ai_public_response: string | null
  ai_internal_response: string | null
  model: string | null
  ai_drafted_at: Date | null
  public_response: string | null
  internal_notes: string | null
  drafted_at: Date | null
  edited_at: Date | null
  edited_by_id: string | null
  approved_at: Date | null
  approved_by_id: string | null
  sent_at: Date | null
  resolved_at: Date | null
  resolved_by_id: string | null
  resolution_action: ReviewDisputeAction | null
  latest_lifecycle_change_id: string | null
  created_at: Date
  updated_at: Date
}
