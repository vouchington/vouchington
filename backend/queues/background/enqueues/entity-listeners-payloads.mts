import type { TopicTypes } from '@voucha/types/entities/topic'

// Job payload shapes for the `entity-listeners` domain. They live next to the job definitions so
// the shared queue package carries no dependency on a domain package; `@queues/entity-listeners/types`
// re-exports them for callers.

// Pure type relocated from backend/services/users/types.mts so this package can define its own
// enqueue job-data shape without depending on @services/users (avoids a workspace cycle).
// `oauth_provider` is inlined as a literal union to keep this package free of service dependencies.
export type UserLoginContext = {
  oauth_provider?: 'facebook' | 'apple' | 'google' | 'x' | 'linkedin' | 'microsoft' | 'github'
  oauth_user_id?: string
  email_address?: string
  phone_number?: string
  device_id?: string
  session_id?: string
  ip_address?: string
  user_agent?: string
}

// Pure type relocated from backend/services/topics/types.mts (same cycle avoidance).
export type CreateTopicUpdates = {
  name: string
  slug: string
  markdown?: string
  topic_type?: TopicTypes
  /** Exclude this topic's pages from search-engine indexing. */
  is_noindexed?: boolean
  /** When false, reviews cannot be created for this topic and review UI is hidden. */
  should_allow_reviews?: boolean
  updated_by_id?: string
  /** Hostname string (e.g. "thepointsguy.com") or UUID. Resolved to a hostname record by the service. */
  hostname?: string | null
  homepage_url_id?: string | null
  logo_image_id?: string | null
  hero_image_id?: string | null
  rewards_program_id?: string | null
  referral_program_id?: string | null
  /** Claim this existing unlinked hashtag alias in the create transaction. */
  source_topic_alias_id?: string
}

export type ProcessPostCreatedJobData = {
  id: string
}

export type ReconcileEntityData = {
  entityType:
    | 'user'
    | 'topic'
    | 'post_created'
    | 'post_updated'
    | 'post_deleted'
    | 'image'
    | 'url'
    | 'community'
    | 'rss_feed_item'
    | 'api_key'
    | 'blocklisted_domain'
    | 'embedding'
    | 'post_slug'
    | 'url_hostname'
    | 'topic_alias'
  entityId: string
  changedAtEpochUs: string
  changeId?: string
  contentChanged?: boolean
  referrerId?: string
  createdInWindow?: boolean
}

export type EntityReconciliationDispatchData = {
  window?: { start: string; end: string }
  after?: ReconcileEntityData
}
