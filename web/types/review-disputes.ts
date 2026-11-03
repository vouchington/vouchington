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

type ReviewDisputePostContent = {
  text: string
  declared_language: string | null
  lingua_rs_detected_language: string | null
}

/**
 * One row of the dispute list. Staff rows add the staff-only fields; members get only the public
 * ones. The claim, drafts, notes and the review context load from the detail read.
 */
export interface ReviewDisputeSummary {
  id: string
  post_id: string
  post_label: string
  topic_id: string
  reason: ReviewDisputeReason
  status: ReviewDisputeStatus
  post_content: ReviewDisputePostContent | null
  created_at: string
  is_overdue?: boolean
  public_response?: string | null
  approved_at?: string | null
  sent_at?: string | null
  resolved_at?: string | null
  resolution_action?: ReviewDisputeAction | null
  // Staff-only fields (omitted in redacted tier)
  disputant_user_id?: string | null
  recommended_action?: ReviewDisputeRecommendedAction | null
  post_slug?: string | null
  disputant?: ReviewDisputeActorSummary
  has_ai_draft?: boolean
  has_draft?: boolean
}

export interface ReviewDispute {
  id: string
  post_id: string
  post_label: string
  topic_id: string
  reason: ReviewDisputeReason
  status: ReviewDisputeStatus
  post_content: ReviewDisputePostContent | null
  created_at: string
  is_overdue?: boolean
  // Staff-only fields (omitted in redacted tier)
  disputant_user_id?: string | null
  claim_text?: string | null
  recommended_action?: ReviewDisputeRecommendedAction | null
  ai_public_response?: string | null
  ai_internal_response?: string | null
  ai_drafted_at?: string | null
  ai_draft_run_id?: string | null
  ai_draft_requested_run_id?: string
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

/** The list row a full detail read stands for, after a staff action changed it. */
export function toReviewDisputeSummary(dispute: ReviewDispute): ReviewDisputeSummary {
  const context = dispute.staff_context
  return {
    id: dispute.id,
    post_id: dispute.post_id,
    post_label: dispute.post_label,
    topic_id: dispute.topic_id,
    reason: dispute.reason,
    status: dispute.status,
    post_content: dispute.post_content,
    created_at: dispute.created_at,
    is_overdue: dispute.is_overdue,
    // A response is public only once it was sent; an unsent one is a draft.
    public_response: dispute.sent_at ? dispute.public_response : null,
    approved_at: dispute.approved_at,
    sent_at: dispute.sent_at,
    resolved_at: dispute.resolved_at,
    resolution_action: dispute.resolution_action,
    disputant_user_id: dispute.disputant_user_id,
    recommended_action: dispute.recommended_action,
    post_slug: context?.review.post.slug ?? null,
    disputant: context?.disputant,
    has_ai_draft: Boolean(dispute.ai_drafted_at),
    has_draft: Boolean(dispute.public_response),
  }
}
