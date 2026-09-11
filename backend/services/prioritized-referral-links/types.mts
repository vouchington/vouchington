export type PrioritizedReferralLink = {
  id: string
  user_id: string | null // null for official links
  referral_program_id: string
  url: string
  label: string | null
  priority_group: number
  contribution_rank: number
  tier_rank: number
  best_score: number
  review_post_id: string | null
  review_post_slug: string | null
  review_avg_rating: number | null
  is_official: boolean
}

export type ReferralLinkUser = {
  id: string
  username: string
  display_name: string | null
}
