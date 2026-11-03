import type { ReviewDispute } from './config.mts'

export type ReviewDisputeActorSummary = {
  id: string
  username: string | null
  verified_display_name: string | null
  profile_image_id: string | null
}

export type ReviewDisputePostContent = {
  text: string
  declared_language: string | null
  lingua_rs_detected_language: string | null
}

export type ReviewDisputeResponse = ReviewDispute & {
  post_label: string
  ai_draft_run_id?: string | null
  ai_draft_requested_run_id: string
  post_content: ReviewDisputePostContent | null
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
      rating: number
    }
  }
}

/**
 * One row of the dispute list. Staff and members both get summaries; the detail read carries the
 * claim, drafts, notes and review context. `public_response` is set only once it was sent.
 */
export type ReviewDisputeSummary = Pick<
  ReviewDispute,
  | 'id'
  | 'post_id'
  | 'topic_id'
  | 'disputant_user_id'
  | 'reason'
  | 'status'
  | 'recommended_action'
  | 'is_overdue'
  | 'public_response'
  | 'approved_at'
  | 'sent_at'
  | 'resolved_at'
  | 'resolution_action'
  | 'created_at'
  | 'updated_at'
> & {
  post_label: string
  post_content: ReviewDisputePostContent | null
  post_slug: string | null
  disputant: ReviewDisputeActorSummary
  has_ai_draft: boolean
  has_draft: boolean
}
