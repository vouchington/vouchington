export type UserReferralLink = {
  id: string
  user_id: string
  referral_program_id: string
  url_id: string
  label: string | null
  activated_at: string | null
  deactivated_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  consecutive_crawl_failures: number
  last_crawl_failure_at: string | null
  last_crawl_success_at: string | null
  last_crawl_id: string | null
  parent_link_id: string | null
  unfurl_requested_at: string | null
  unfurl_completed_at: string | null
  unfurl_failed_at: string | null
  unfurl_last_error: string | null
}

export type UserReferralLinkWithDetails = UserReferralLink & {
  url: string
  referral_program_name: string
  referral_program_slug: string
}
