export type OfficialReferralLink = {
  id: string
  user_id: string // always the @voucha system user's id
  referral_program_id: string
  url_id: string
  url: string // populated via join
  label: string | null
  activated_at: Date | null
  deactivated_at: Date | null
  deleted_at: Date | null
  created_by_id: string | null
  deleted_by_id: string | null
  created_at: Date
}
