export const VALID_REFERRAL_LINKS_FEED_TYPES = ['follow_users', 'mutual_follows'] as const
export type ReferralLinksFeedType = (typeof VALID_REFERRAL_LINKS_FEED_TYPES)[number]

export type ReferralLinkFeedRow = {
  id: string
  user_id: string
  referral_program_id: string
  referral_program_name: string
  referral_program_slug: string
  url: string
  label: string | null
}

export type ReferralLinkFeedUserRow = {
  id: string
  username: string
  display_name: string | null
  profile_image_id: string | null
}
