import type {
  CommunityListType,
  CommunityMemberRosterVisibility,
  CommunityVisibility,
} from './types.mts'

export type UpdateCommunityInput = {
  name?: string
  slug?: string
  markdown?: string | null
  visibility?: CommunityVisibility
  member_roster_visibility?: CommunityMemberRosterVisibility
  list_type?: CommunityListType | null
  member_invites_allowed_at?: Date | null
  post_approval_required_at?: Date | null
  profile_image_id?: string | null
  banner_image_id?: string | null
  default_language?: string | null
}
