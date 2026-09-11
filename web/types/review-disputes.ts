export type {
  ReviewDisputeAction,
  ReviewDisputeReason,
  ReviewDisputeRecommendedAction,
  ReviewDisputeStatus,
} from '@ts-shared/utils/moderation-catalogs'
import type {
  ReviewDisputeAction,
  ReviewDisputeReason,
  ReviewDisputeRecommendedAction,
  ReviewDisputeStatus,
} from '@ts-shared/utils/moderation-catalogs'

export interface ReviewDisputeActorSummary {
  id: string
  username: string | null
  verified_display_name: string | null
  profile_image_id: string | null
}

export interface ReviewDispute {
  id: string
  post_id: string
  topic_id: string
  reason: ReviewDisputeReason
  status: ReviewDisputeStatus
  post_content: {
    text: string
    declared_language: string | null
    lingua_rs_detected_language: string | null
  } | null
  created_at: string
  // Staff-only fields (omitted in redacted tier)
  disputant_user_id?: string | null
  claim_text?: string | null
  recommended_action?: ReviewDisputeRecommendedAction | null
  ai_public_response?: string | null
  ai_internal_response?: string | null
  ai_drafted_at?: string | null
  public_response?: string | null
  internal_notes?: string | null
  drafted_at?: string | null
  edited_at?: string | null
  approved_at?: string | null
  sent_at?: string | null
  resolved_at?: string | null
  resolution_action?: ReviewDisputeAction | null
  staff_context?: {
    disputant: ReviewDisputeActorSummary
    review: {
      post: {
        id: string
        title: string
        declared_language: string | null
        lingua_rs_detected_language: string | null
        slug: string | null
        markdown_preview: string
        created_by_id: string | null
        created_at: string
      }
      topic: {
        id: string
        name: string
        slug: string
        topic_type: string
      } | null
      rating: number | null
    }
  }
}

export interface PostDisputeAnnotation {
  id: string
  post_id: string
  review_dispute_id: string
  body_text: string
  created_at: string
}
