import type { communityListItemTypeCatalog } from './community-list-item-type.mts'

export type CommunityListItemType = keyof typeof communityListItemTypeCatalog

export type CommunityVisibility = 'public' | 'private'
export type CommunityMemberRosterVisibility = 'public' | 'users' | 'members' | 'moderators'
export type CommunityMemberRole = 'owner' | 'moderator' | 'member'
export type CommunityListType = 'follow' | 'mute'
export type CommunityRestrictionType =
  | 'require_post_approval'
  | 'no_new_member_posts'
  | 'no_links'
  | 'approved_members_only'

export type Community = {
  __entity_type: 'community'
  id: string
  name: string
  slug: string
  markdown: string | null
  visibility: CommunityVisibility
  member_roster_visibility: CommunityMemberRosterVisibility
  list_type: CommunityListType | null
  member_invites_allowed_at: Date | null
  post_approval_required_at: Date | null
  allow_review_posts: boolean
  allow_data_point_posts: boolean
  trusted_at: Date | null
  profile_image_id: string | null
  banner_image_id: string | null
  created_by_id: string
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  deleted_by_id: string | null
  archived_at: Date | null
  archived_by_id: string | null
  default_language?: string | null
  lingua_rs_detected_language?: string | null
  rules_markdown: string | null
}

export type CommunityMember = {
  __entity_type: 'community_member'
  id: string
  community_id: string
  user_id: string
  role: CommunityMemberRole
  approved_by_id: string | null
  created_at: Date
  updated_at: Date
  removed_at: Date | null
  removed_by_id: string | null
}

export type CommunityApplicationQuestion = {
  __entity_type: 'community_application_question'
  id: string
  community_id: string
  question: string
  field_type: 'short_text' | 'long_text' | 'single_select' | 'multi_select' | 'checkbox'
  options: string[] | null
  order_index: number
  required: boolean
  created_at: Date
  deleted_at: Date | null
}

export type CommunityApplication = {
  __entity_type: 'community_application'
  id: string
  community_id: string
  user_id: string
  answers: Record<string, unknown>
  message: string | null
  reviewed_at: Date | null
  reviewed_by_id: string | null
  approved_at: Date | null
  rejected_at: Date | null
  rejection_reason: string | null
  created_at: Date
}

export type CommunityInvite = {
  __entity_type: 'community_invite'
  id: string
  community_id: string
  code: string
  invited_user_id: string | null
  invited_email: string | null
  invited_by_id: string
  accepted_at: Date | null
  accepted_by_user_id: string | null
  declined_at: Date | null
  revoked_at: Date | null
  created_at: Date
}

export type CommunityPostReview = {
  __entity_type: 'community_post_review'
  community_id: string
  post_id: string
  submitted_by_id: string | null
  created_at: Date
  reviewed_at: Date | null
  reviewed_by_id: string | null
  approved_at: Date | null
  rejected_at: Date | null
  rejection_reason: string | null
  unpublished_at: Date | null
  unpublished_by_id: string | null
}

export type CommunityPinnedPost = {
  __entity_type: 'community_pinned_post'
  community_id: string
  post_id: string
  order_index: number
  pinned_by_id: string
  created_at: Date
}

export type CommunityMetrics = {
  __entity_type: 'community_metrics'
  id: string
  member_count: number
  post_count: number
  list_item_count: number
  proxy_follow_count: number
  proxy_mute_count: number
  virtual_subscription_count: number
}

export type CommunityBan = {
  __entity_type: 'community_ban'
  id: string
  case_id: string
  community_id: string
  user_id: string
  banned_by_id: string | null
  reason: string | null
  expires_at: Date | null
  created_at: Date
  updated_at: Date
  lifted_at: Date | null
  lifted_by_id: string | null
}

export type CommunityRestriction = {
  __entity_type: 'community_restriction'
  id: string
  community_id: string
  restriction_type: CommunityRestrictionType
  activated_by_id: string | null
  activated_at: Date
  expires_at: Date | null
  created_at: Date
  updated_at: Date
  lifted_at: Date | null
  lifted_by_id: string | null
  reason: string | null
}

export type CommunityListItem = {
  __entity_type: 'community_list_item'
  id: string
  community_id: string
  item_type: CommunityListItemType
  entity_id: string
  order_index: number
  added_by_id: string | null
  created_at: Date
}

export type CommunityBanEvasionFlag = {
  community_id: string
  user_id: string
  suspected_ban_evader_at: Date
  suspected_ban_evader_source_user_id: string | null
  suspected_ban_evader_score: number | null
  suspected_ban_evader_dismissed_at: Date | null
  suspected_ban_evader_dismissed_by_id: string | null
}
