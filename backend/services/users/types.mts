import type { QueryOptions } from '@data-stores/psql/types'
import type { PoolClient } from 'pg'
import type { OAuthProvider, OAuthAccount } from '@services/oauth-accounts'
import type { UserPrivacyAudience } from '@voucha/types/entities/user'

export type { OAuthProvider }

// API-facing entity types — canonical definitions live in @voucha/types/entities/user
export type {
  UserPrivacyAudience,
  UserPrivacySettings,
  BasicUser,
  PublicUser,
  PrivateUser,
  UserMetrics,
} from '@voucha/types/entities/user'

export type GetUserByAnyArgumentsOptions = QueryOptions & {
  // should only be set by the system for admins who are looking up users by private information
  private?: boolean
}

export type UpsertUserOptions = {
  oauthAccount?: { provider: OAuthProvider; account: OAuthAccount }
  emailAddress?: string
  phoneNumber?: string
  deviceId?: string
  sessionId?: string
  ipAddress?: string
  userAgent?: string
}

// this is an internal function that is used to create a user
// it should not be called directly as the public APIs should only use `upsertUser`
export type CreateUserOptions = {
  oauthAccount?: { provider: OAuthProvider; account: OAuthAccount }
  emailAddress?: string
  phoneNumber?: string
  deviceId?: string
  sessionId?: string
}

// Canonical definition lives in @queues/entity-listeners/types (the enqueue job-payload
// contract); re-exported here since this service already depends on that queue for real
// enqueue calls and has other in-package consumers of this type (avoids a workspace cycle).
export type { UserLoginContext } from '@queues/entity-listeners/types'

export type GetUserOptions = {
  oauthAccount?: { provider: OAuthProvider; account: OAuthAccount }
  emailAddress?: string
  phoneNumber?: string
  client?: PoolClient
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

export type UpdateUserOptions = {
  username?: string
  use_display_name_from?: DisplayNameSource | ''
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
  engagement_emails_enabled?: boolean
  news_digest_frequency?: 'none' | 'daily' | 'weekly'
  moderation_emails_enabled?: boolean
  community_digest_frequency?: 'none' | 'daily' | 'weekly'
  moderation_email_cadence?: 'daily' | 'selected_days' | 'weekly'
  moderation_email_days_of_week?: number[]
  moderation_email_time_of_day?: string
  moderation_email_timezone?: string
  processing_restricted_at?: boolean
  third_party_marketing?: boolean
  hn_discussions?: boolean
  country?: string | null
  ui_locale?: string | null
  fediverse_federation_enabled?: boolean
}
