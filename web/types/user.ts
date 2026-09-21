/* oxlint-disable max-lines -- User entity shape intentionally mirrors the backend private-user projection. */
import type { UserPrivateMetricsCount } from './user-metrics'
export type { MfaStatus, TotpAuthenticator } from './mfa'

export type UserPrivacyAudience = 'everyone' | 'users' | 'followers' | 'mutual_followers' | 'nobody'
export type OAuthProvider =
  | 'facebook'
  | 'apple'
  | 'google'
  | 'x'
  | 'linkedin'
  | 'microsoft'
  | 'github'
export type IdentityVerificationStatus =
  | 'unverified'
  | 'payment_pending'
  | 'identity_pending'
  | 'verified'
  | 'failed'
  | 'duplicate_id'
export type PublicVerifiedNameDisplay =
  | 'hidden'
  | 'first_name'
  | 'first_name_last_initial'
  | 'full_name'
export interface OAuthAccountInfo {
  id: string
  name: string
  email_address: string | null
}
export interface ImagePlacementTuple {
  placement_id: string
  placement_revision: number
  image_id: string
}
export interface BlueskyAccountInfo {
  did: string
  handle: string | null
}
export interface User {
  id: string
  username?: string
  email_address?: string
  roles: string[]
  profile_image_id?: string | null
  profile_image_placement?: ImagePlacementTuple | null
  markdown?: string
  is_agent?: boolean
  is_official_account?: boolean
  verification_status?: IdentityVerificationStatus | null
  verified_badge_visible?: boolean | null
  verified_display_name?: string | null
  use_display_name_from?:
    | 'username'
    | 'facebook'
    | 'x'
    | 'apple'
    | 'google'
    | 'linkedin'
    | 'microsoft'
    | 'github'
  display_account?: { id?: string; name: string | null } | null
  facebook_account?: OAuthAccountInfo
  apple_account?: OAuthAccountInfo
  google_account?: OAuthAccountInfo
  x_account?: OAuthAccountInfo
  linkedin_account?: OAuthAccountInfo
  microsoft_account?: OAuthAccountInfo
  github_account?: OAuthAccountInfo
  bluesky_account?: BlueskyAccountInfo | null
  cards_visibility?: UserPrivacyAudience
  rewards_program_statuses_visibility?: UserPrivacyAudience
  spending_categories_visibility?: UserPrivacyAudience
  follows_visibility?: UserPrivacyAudience
  topic_follows_visibility?: UserPrivacyAudience
  rss_feed_follows_visibility?: UserPrivacyAudience
  community_memberships_visibility?: UserPrivacyAudience
  followers_visibility?: UserPrivacyAudience
  likes_visibility?: UserPrivacyAudience
  direct_messages_audience?: UserPrivacyAudience
  default_post_broadcast?: 'everyone' | 'users' | 'followers' | 'mutual_followers'
  default_post_privacy?: 'public' | 'private'
  engagement_emails_enabled?: boolean | null
  news_digest_frequency?: 'none' | 'daily' | 'weekly' | null
  moderation_emails_enabled?: boolean | null
  community_digest_frequency?: 'none' | 'daily' | 'weekly' | null
  moderation_email_cadence?: 'daily' | 'selected_days' | 'weekly' | null
  moderation_email_days_of_week?: number[] | null
  moderation_email_time_of_day?: string | null
  moderation_email_timezone?: string | null
  processing_restricted_at?: string | null
  third_party_marketing?: boolean | null
  hn_discussions?: boolean
  suspended_at?: string | null
  suspended_reason?: string | null
  suspended_by_id?: string | null
  membership_plan?: 'plus' | 'pro' | null
  country?: string | null
  ui_locale?: string | null
  lingua_rs_detected_language?: string | null
}
export type UpdateUserBody = Pick<
  User,
  | 'username'
  | 'use_display_name_from'
  | 'cards_visibility'
  | 'rewards_program_statuses_visibility'
  | 'spending_categories_visibility'
  | 'follows_visibility'
  | 'topic_follows_visibility'
  | 'rss_feed_follows_visibility'
  | 'community_memberships_visibility'
  | 'followers_visibility'
  | 'likes_visibility'
  | 'direct_messages_audience'
  | 'default_post_broadcast'
  | 'default_post_privacy'
  | 'engagement_emails_enabled'
  | 'news_digest_frequency'
  | 'moderation_emails_enabled'
  | 'community_digest_frequency'
  | 'moderation_email_cadence'
  | 'moderation_email_days_of_week'
  | 'moderation_email_time_of_day'
  | 'moderation_email_timezone'
  | 'country'
  | 'ui_locale'
> & {
  processing_restricted_at?: boolean
  third_party_marketing?: boolean
  hn_discussions?: boolean
}
export interface PublicUser {
  id: string
  username?: string
  roles?: readonly string[]
  profile_image_id?: string | null
  profile_image_placement?: ImagePlacementTuple | null
  is_official_account?: boolean
  verification_status?: IdentityVerificationStatus | null
  verified_badge_visible?: boolean | null
  verified_display_name?: string | null
  public_verified_name_display?: PublicVerifiedNameDisplay | null
  use_display_name_from?:
    | 'username'
    | 'facebook'
    | 'x'
    | 'apple'
    | 'google'
    | 'linkedin'
    | 'microsoft'
    | 'github'
  display_account?: { id?: string; name: string | null } | null
}
export type UserSearchResult = PublicUser & {
  email_address?: string
  suspended_at?: string | null
  suspended_reason?: string | null
  suspended_by_id?: string | null
}
export interface UserMetrics {
  __entity_type: 'user_metrics'
  id: string
  count: {
    reviews: number
    discussions: number
    comments: number
    users_following: number
    users_followers: number
    topics_following: number
    rss_feeds_following: number
    communities_member: number
  }
  viewer_count?: {
    reviews: number
    discussions: number
    comments: number
  }
  private_count?: UserPrivateMetricsCount
  bookmarks: {
    follow: {
      topics: number
      posts: number
      users: number
    }
  }
  bookmarkers: {
    follow: number
  }
  bookmarks__updated_at: string
}
export interface EmailAddress {
  email_address: string
  is_primary: boolean
  created_at: string
}
export type ProfileLinkType =
  | 'url'
  | 'twitter'
  | 'facebook'
  | 'instagram'
  | 'github'
  | 'linkedin'
  | 'youtube'
  | 'tiktok'

export interface Passkey {
  id: string
  name: string
  device_type: 'singleDevice' | 'multiDevice'
  backed_up: boolean
  created_at: string
  last_used_at: string | null
}

export interface ProfileLink {
  id: string
  user_id: string
  link_type: ProfileLinkType
  sort_order: number
  url: string | null
  handle: string | null
  name: string | null
  image_id: string | null
  image_placement?: ImagePlacementTuple | null
  created_at: string
  updated_at: string
}
