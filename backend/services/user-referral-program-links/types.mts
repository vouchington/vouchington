export type UserReferralLink = {
  id: string
  user_id: string
  referral_program_id: string
  url_id: string
  label: string | null
  activated_at: Date | null
  deactivated_at: Date | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  consecutive_crawl_failures: number
  last_crawl_failure_at: Date | null
  last_crawl_success_at: Date | null
  last_crawl_id: string | null
  parent_link_id: string | null
  unfurl_requested_at: Date | null
  unfurl_completed_at: Date | null
  unfurl_failed_at: Date | null
  unfurl_last_error: string | null
}

export type UserReferralLinkWithDetails = UserReferralLink & {
  url: string
  referral_program_name: string
  referral_program_slug: string
}
