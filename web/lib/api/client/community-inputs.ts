import type {
  CommunityVisibility,
  CommunityMemberRosterVisibility,
  CommunityListType,
} from '@/types/api-responses'

export interface CreateCommunityInput {
  name: string
  slug?: string
  markdown?: string
  visibility?: CommunityVisibility
  list_type?: CommunityListType | null
  member_roster_visibility?: CommunityMemberRosterVisibility
  post_approval_required_at?: boolean
  should_allow_review_posts?: boolean
  should_allow_data_point_posts?: boolean
  member_invites_allowed_at?: boolean
  cf_turnstile_response?: string
}
export type UpdateCommunityInput = Partial<
  Omit<
    CreateCommunityInput,
    | 'should_allow_review_posts'
    | 'should_allow_data_point_posts'
    | 'cf_turnstile_response'
    | 'markdown'
  >
> & {
  markdown?: string | null
  default_language?: string | null
  profile_image_id?: string | null
  banner_image_id?: string | null
}
