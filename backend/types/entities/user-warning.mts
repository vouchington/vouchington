export interface UserWarning {
  id: string
  case_id: string
  user_id: string
  community_id: string | null
  issued_by_id: string | null
  reason: string
  public_message: string | null
  report_id: string | null
  revoked_at: Date | null
  revoked_by_id: string | null
  created_at: Date
}
