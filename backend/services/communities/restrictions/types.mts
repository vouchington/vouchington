import type { CommunityRestrictionType } from '../types.mts'

export const COMMUNITY_RESTRICTION_TYPES: CommunityRestrictionType[] = [
  'require_post_approval',
  'no_new_member_posts',
  'no_links',
  'approved_members_only',
]

export type RaidModeSuggestion = {
  velocity_spike: boolean
  flag_count: number
  latest_flagged_at: Date | null
}
