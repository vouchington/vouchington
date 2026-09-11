import type { TopicTypes } from '@voucha/types/entities/topic'

// Relocated from backend/services/users/types.mts (pure type, no runtime logic) so that this
// package can define its own enqueue job-data shape without depending on @services/users, which
// already depends on @queues/entity-listeners for real enqueue calls (avoids a workspace cycle).
// `oauth_provider` is inlined as a literal union (rather than importing the canonical
// `OAuthProvider` type from `@services/oauth-accounts`) to keep this queue package free of
// service dependencies for what is, here, just a job-payload field.
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

// Relocated from backend/services/topics/types.mts (pure type, no runtime logic) so that this
// package can define its own enqueue job-data shape without depending on @services/topics, which
// already depends on @queues/entity-listeners for real enqueue calls (avoids a workspace cycle).
export type CreateTopicUpdates = {
  name: string
  slug: string
  markdown?: string
  topic_type?: TopicTypes
  /** Exclude this topic's pages from search-engine indexing. */
  noindex?: boolean
  /** When false, reviews cannot be created for this topic and review UI is hidden. */
  allow_reviews?: boolean
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

export type EntityJobs =
  | 'reconcileEntity'
  | 'reconcileEntities'
  | 'processUrlCreated'
  | 'processUrlUpdated'
  | 'processUrlDeleted'
  | 'processImageCreated'
  | 'processImageUpdated'
  | 'processImageDeleted'
  | 'processUserCreated'
  | 'processUserUpdated'
  | 'processUserLoggedIn'
  | 'processUserDeleted'
  | 'processAutoFollowReferrer'
  | 'processPostCreated'
  | 'processPostUpdated'
  | 'processPostDeleted'
  | 'processReconcilePostCategoryFinalizations'
  | 'processTopicCreated'
  | 'processTopicUpdated'
  | 'processTopicDeleted'
  | 'processConversationMessageCreated'
  | 'processCommunityAgentPromptsDeactivated'

export type EntityJobsListeners = Record<EntityJobs, (data: any) => unknown>

export type ReconcileEntityData = {
  entityType: 'user' | 'topic' | 'post_created' | 'post_updated' | 'post_deleted' | 'image' | 'url'
  entityId: string
  changedAtEpochUs: string
  changeId?: string
  contentChanged?: boolean
  referrerId?: string
}
