export interface IntegrityPenaltyRecord {
  id: string
  user_id: string
  user_username: string | null
  user_display_name: string | null
  creator_username: string | null
  creator_display_name: string | null
  revoker_username: string | null
  revoker_display_name: string | null
  source_flag_type: string | null
  reason: string
  source_flag_id: string | null
  created_by_id: string | null
  revoked_at: string | null
  revoked_by_id: string | null
  created_at: string
}
