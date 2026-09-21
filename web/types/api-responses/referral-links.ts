import type * as Api from './shared'
import type { ImagePlacementTuple } from '../user'

type PageInfo = Api.PageInfo

export interface PrioritizedReferralLink {
  id: string
  user_id: string | null
  is_official: boolean
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
}

export interface ReferralLinkUser {
  id: string
  username: string
  display_name: string | null
}

export type ReferralLinkFeedUser = ReferralLinkUser & {
  profile_image_id: string | null
  profile_image_placement?: ImagePlacementTuple | null
}

export type ReferralLinkFeedItem = {
  id: string
  user_id: string
  referral_program_id: string
  referral_program_name: string
  referral_program_slug: string
  url: string
  label: string | null
}

export type ReferralLinkFeedResponse = {
  results: ReferralLinkFeedItem[]
  users: Record<string, ReferralLinkFeedUser>
  page_info: PageInfo
}

export interface PrioritizedReferralLinksResponse {
  links: PrioritizedReferralLink[]
  users: Record<string, ReferralLinkUser>
}

export interface UserReferralLinkWithDetails {
  id: string
  user_id: string
  referral_program_id: string
  url_id: string
  url: string
  label: string | null
  activated_at: string | null
  deactivated_at: string | null
  created_at: string
  updated_at: string
  referral_program_name: string
  referral_program_slug: string
  parent_link_id: string | null
  unfurl_requested_at: string | null
  unfurl_completed_at: string | null
  unfurl_failed_at: string | null
  unfurl_last_error: string | null
}

export interface ReferralProgramValidationInfo {
  user_help_text: string
  example_urls: string[]
}
