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
