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

/** Fields present on every list row. Owner rows also include the management columns. */
export type PublicUserReferralLinkListItem = {
  id: string
  user_id: string
  referral_program_id: string
  url_id: string
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  parent_link_id: string | null
  url: string
  referral_program_name: string
  referral_program_slug: string
}

export type UserReferralLinkListItem = PublicUserReferralLinkListItem &
  Partial<
    Pick<
      UserReferralLink,
      | 'label'
      | 'activated_at'
      | 'deactivated_at'
      | 'consecutive_crawl_failures'
      | 'last_crawl_failure_at'
      | 'last_crawl_success_at'
      | 'last_crawl_id'
      | 'unfurl_requested_at'
      | 'unfurl_completed_at'
      | 'unfurl_failed_at'
      | 'unfurl_last_error'
    >
  >
