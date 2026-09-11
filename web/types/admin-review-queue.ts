export interface AdminReviewQueuePost {
  id: string
  title: string
  declared_language: string | null
  lingua_rs_detected_language: string | null
  slug: string | null
  markdown_preview: string
  post_type: string
  created_by_id: string | null
  created_at: string
  root_id: string | null
  root_post_type: string | null
  root_slug: string | null
  clearance_status: 'rejected' | 'in_review' | 'approved' | 'pending'
  clearance_updated_at: string | null
  spam_detection_flagged: boolean | null
  spam_detection_score: number | null
  spam_detection_results: unknown
  openai_omni_moderation_flagged: boolean | null
  openai_omni_moderation_results: unknown
  media_context?: {
    requires_reveal: boolean
    images: Array<{
      image_id: string
      order_index: number
      caption: string
    }>
  }
}

export interface AdminReviewQueueResponse {
  results: AdminReviewQueuePost[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

export interface AdminReviewQueueUpdateResponse {
  post: {
    id: string
    clearance_status: AdminReviewQueuePost['clearance_status']
    clearance_updated_at: string | null
  }
}
