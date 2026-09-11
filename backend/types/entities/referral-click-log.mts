export type ReferralClickLogEntry = {
  __entity_type: 'referral_click_log'
  id: string
  landing_url: string
  signed_up_at: Date | null
  user_id: string | null
  created_at: Date
}
