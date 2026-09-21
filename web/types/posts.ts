/**
 * Post types for frontend rendering.
 *
 * Simple types and enums are re-exported from the canonical backend definitions.
 * Composite types (Post) remain local because the API response shape includes
 * web-specific nested objects that diverge from the backend entity type.
 */

import type { Serialized } from '@voucha/types/serialized'
import type {
  PostType as BackendPostType,
  PostBroadcast as BackendPostBroadcast,
  PostPrivacy as BackendPostPrivacy,
  PostMetrics as BackendPostMetrics,
  PostElection as BackendPostElection,
  RecommendationStatus as BackendRecommendationStatus,
} from '@voucha/types/entities/post'

// Re-export enums and simple types from canonical backend definitions
export type TopicRecommendationStatus = BackendRecommendationStatus
export type PostType = BackendPostType
export type PostBroadcast = BackendPostBroadcast
export type PostPrivacy = BackendPostPrivacy

// Types with Date→string conversion
export type PostMetrics = Serialized<BackendPostMetrics>

// Election types — no Date fields, structurally identical
export type PostElection = BackendPostElection

export interface PostCreatedBy {
  __entity_type: 'user'
  id: string
  username: string
  profile_image_id: string | null
  profile_image_placement?: import('./user').ImagePlacementTuple | null
  is_official_account?: boolean
}

export interface PostCommunity {
  id: string
  name: string
  slug: string
}

export interface AuthorAside {
  about_html: string
  profile_links: import('./user').ProfileLink[]
  is_following: boolean
}

export interface Post {
  id: string
  post_type: PostType
  title: string
  slug?: string | null
  markdown: string
  parent_id?: string | null
  root_id: string | null
  created_by_id: string | null
  created_by?: PostCreatedBy | null
  created_at: string // ISO 8601 date string
  updated_at: string
  deleted_at: string | null
  deleted_by_id: string | null
  archived_at: string | null
  archived_by_id: string | null
  locked_at?: string | null
  locked_by_id?: string | null
  broadcast: PostBroadcast
  privacy: PostPrivacy
  is_anonymous: boolean
  community_id: string | null
  community?: PostCommunity | null
  clearance_status: 'pending' | 'approved' | 'rejected' | 'in_review'
  clearance_reason?: string | null
  ai_summary_markdown?: string | null
  images?: Array<{
    image_id: string
    placement_id: string
    placement_revision: number
    order_index: number
    caption: string
  }>
  review_topic_ratings?: Array<{
    topic_id: string
    rating: number
    order_index: number
    updated_at: string
    category_slug?: string | null
    topic?: {
      __entity_type: 'topic'
      id: string
      name: string
      slug: string
      markdown: string
      topic_type: string
      created_at: string
      referral_program_id: string | null
      referral_program_slug?: string | null
    }
  }> | null
  post_related_topics?: Array<{
    __entity_type: 'topic'
    id: string
    name: string
    slug: string
    topic_type: string
    referral_program_id: string | null
  }>
  post_hashtags?: Array<{
    id: string
    key: string
    display_token: string
    topic_id: string | null
  }>
  post_explicit_categories?: Array<
    { type: 'topic'; topic_id: string; topic_name: string } | { type: 'hashtag'; hashtag: string }
  >
  topic_recommendation?: {
    post_id: string
    topic_title: string
    topic_slug: string
    topic_markdown: string | null
    aliases: string[]
    hostname_id: string | null
    hostname: {
      __entity_type: 'hostname'
      id: string
      hostname: string
    } | null
    hostnames: Array<{
      __entity_type: 'hostname'
      id: string
      hostname: string
    }>
    approval_error_message: string | null
    status: TopicRecommendationStatus
    reviewed_at: string | null
    reviewed_by_id: string | null
    rejection_reason: string | null
    created_topic_id: string | null
    created_topic_slug?: string | null
    topic_type: 'topic' | 'referral_program' | 'card'
    example_referral_link: string | null
    landing_page_urls: string[]
  } | null
  data_point_vertical?: string | null
  structured_data?: unknown | null
  declared_language?: string | null
  lingua_rs_detected_language?: string | null
  can_edit_content?: boolean
  can_delete?: boolean
  can_unpublish_from_community?: boolean
  can_lock?: boolean
  /** Present on pending-post mod-queue responses */
  claim?: import('./api-responses/community-moderation').ModerationQueueClaim | null
  /** Present on pending-post mod-queue responses when the post has been escalated */
  escalated_at?: string | null
}

// API response search result — differs from internal backend search result
export interface PostSearchResult {
  __entity_type: 'post'
  id: string
  ranking: number
  search_vector_ts: string | null
  entity_id?: string
  post_type?: PostType
  delivery_type?: 'direct' | 'share'
  shared_by_user_id?: string
  shared_at?: string
}

// Shared API election vote shape.
export interface ElectionVote {
  __entity_type: 'election_vote'
  entity_id: string
  user_id: string
  choice: import('@/lib/api/client/elections').ElectionVoteChoice
  created_at: string
}
