export interface UserModNote {
  id: string
  created_at: string
  target_user_id: string
  author_user_id: string
  community_id: string | null
  body: string
  deleted_at: string | null
}

export interface UserModerationContext {
  account_age_ms: number
  trust_tier: number | null
  active_suspension: { suspended_at: string; suspended_reason: string | null } | null
  /** null for non-staff callers (staff-gated) */
  content_removal_count: number | null
  /** null for non-staff callers (staff-gated) */
  community_removal_count: number | null
}

export interface UserModNotesListResponse {
  notes: UserModNote[]
  page_info: { has_next_page: boolean }
}

export interface UserModerationContextResponse {
  context: UserModerationContext
  notes: UserModNote[]
  page_info: { has_next_page: boolean }
}
