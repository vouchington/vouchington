export type UserPrivacyAudience = 'everyone' | 'users' | 'followers' | 'mutual_followers' | 'nobody'

export type UserPrivacySettings = {
  cards_visibility: UserPrivacyAudience
  rewards_program_statuses_visibility: UserPrivacyAudience
  spending_categories_visibility: UserPrivacyAudience
  follows_visibility: UserPrivacyAudience
  topic_follows_visibility: UserPrivacyAudience
  rss_feed_follows_visibility: UserPrivacyAudience
  community_memberships_visibility: UserPrivacyAudience
  followers_visibility: UserPrivacyAudience
  likes_visibility: UserPrivacyAudience
  direct_messages_audience: UserPrivacyAudience
  default_post_broadcast: 'everyone' | 'users' | 'followers' | 'mutual_followers'
  default_post_privacy: 'public' | 'private'
  is_engagement_emails_enabled: boolean
  news_digest_frequency: 'none' | 'daily' | 'weekly'
  is_moderation_emails_enabled: boolean
  community_digest_frequency: 'none' | 'daily' | 'weekly'
  moderation_email_cadence: 'daily' | 'selected_days' | 'weekly'
  moderation_email_days_of_week: number[]
  moderation_email_time_of_day: string
  moderation_email_timezone: string | null
  // Phase C opt-in to ActivityPub federation. Default FALSE; when TRUE, a public AP actor is
  // exposed at /ap/users/:id and inbound follows are auto-accepted.
  is_fediverse_federation_enabled: boolean
}

type DisplayNameSource =
  | 'username'
  | 'facebook'
  | 'x'
  | 'apple'
  | 'google'
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

export type OAuthAccountInfo = {
  id: string
  name: string | null
  email_address: string | null
}

export type ImagePlacementTuple = {
  placement_id: string
  placement_revision: number
  image_id: string
}

// AT Protocol account linking (Phase D) has no numeric provider ID or email — identity is the DID,
// with handle as the mutable human-readable label — so it does not fit OAuthAccountInfo's shape.
export type BlueskyAccountInfo = {
  did: string
  handle: string | null
}

export type BasicUser = {
  __entity_type: 'user'
  id: string
  individual_id?: string | null
  username?: string | null
  use_display_name_from?: DisplayNameSource | null
  roles: readonly string[]
  profile_image_id?: string | null
  profile_image_placement?: ImagePlacementTuple | null
  markdown?: string | null
  account_type: import('@ts-shared/utils/account-type').AccountType
  verification_status?: IdentityVerificationStatus | null
  is_verified_badge_visible?: boolean | null
  verified_display_name?: string | null
}

export type PublicDisplayAccount = {
  name: string | null
}

export type PublicUser = Omit<BasicUser, 'individual_id'> & {
  display_account?: PublicDisplayAccount | null
  public_verified_name_display?: PublicVerifiedNameDisplay | null
  lingua_rs_detected_language?: string | null
}

export type PrivateUser = BasicUser & {
  facebook_account?: OAuthAccountInfo | null
  apple_account?: OAuthAccountInfo | null
  google_account?: OAuthAccountInfo | null
  x_account?: OAuthAccountInfo | null
  linkedin_account?: OAuthAccountInfo | null
  microsoft_account?: OAuthAccountInfo | null
  github_account?: OAuthAccountInfo | null
  bluesky_account?: BlueskyAccountInfo | null
  email_address?: string | null
  phone_number?: string | null
  processing_restricted_at?: Date | null
  should_receive_third_party_marketing?: boolean | null
  should_import_hacker_news_discussions?: boolean
  suspended_at?: Date | null
  suspended_reason?: string | null
  suspended_by_id?: string | null
  bad_faith_reporter_at?: Date | null
  membership_plan?: import('./membership.mts').MembershipPlanSlug | null
  // Identity-verification private fields — not exposed on PublicUser
  // (is_verified_badge_visible is on PublicUser/BasicUser; public_verified_name_display is on both PublicUser and PrivateUser)
  verification_provider?: string | null
  verification_completed_at?: Date | null
  public_verified_name_display?: PublicVerifiedNameDisplay
  verified_first_name?: string | null
  verified_last_name_initial?: string | null
  verified_full_name?: string | null
  pending_verification_session_id?: string | null
  country?: string | null
  ui_locale?: string | null
  lingua_rs_detected_language?: string | null
} & UserPrivacySettings

export type UserMetrics = {
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
  private_count?: {
    posts_saved: number
    posts_hidden: number
    posts_following: number
    posts_subscribed: number
    topics_blocked: number
    topics_muted: number
    topics_viewed: number
    topics_subscribed_posts: number
    topics_subscribed_news: number
    topics_dismissed_recommendations: number
    users_blocked: number
    users_muted: number
    users_subscribed_posts: number
    users_dismissed_recommendations: number
    rss_feeds_subscribed: number
    rss_feeds_muted: number
    rss_feeds_viewed: number
    rss_feed_items_saved: number
    rss_feed_items_hidden: number
    rss_feed_items_viewed: number
    urls_saved: number
    domains_blocked: number
    domains_muted: number
    communities_saved: number
    communities_proxy_following: number
    communities_proxy_muted: number
  }
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
  bookmarks__updated_at: Date
}
