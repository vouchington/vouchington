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
  moderation_summary: {
    disposition: 'pass' | 'review' | 'reject' | 'incomplete' | null
    reason_codes: string[]
    evidence_summary: {
      flagged_category_count: number
      signal_count: number
    }
  }
  media_reveal: {
    requires_reveal: boolean
    images: Array<{
      image_id: string
      placement_id: string
      placement_revision: number
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
