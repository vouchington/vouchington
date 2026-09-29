import type {
  CommunityListType,
  CommunityMemberRosterVisibility,
  CommunityVisibility,
} from './types.mts'

export type CreateCommunityInput = {
  name: string
  slug?: string
  markdown?: string
  visibility?: CommunityVisibility
  list_type?: CommunityListType | null
  member_roster_visibility?: CommunityMemberRosterVisibility
  member_invites_allowed_at?: Date | null
  post_approval_required_at?: Date | null
  allow_review_posts?: boolean
  allow_data_point_posts?: boolean
  profile_image_id?: string | null
  banner_image_id?: string | null
  default_language?: string | null
}
