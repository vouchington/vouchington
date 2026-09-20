import type { BasicUser } from './user.mts'

export type ClearanceStatus = 'pending' | 'approved' | 'rejected' | 'in_review'
export type RecommendationStatus = 'pending' | 'approved' | 'rejected'
export type TopicRecommendationStatus = RecommendationStatus

export type PostType =
  | 'discussion'
  | 'review'
  | 'data_point'
  | 'topic_recommendation'
  | 'comment'
  | 'story'
  | 'link'
  | 'article'
  | 'blog_post'
export type PostBroadcast = 'everyone' | 'users' | 'followers' | 'mutual_followers'
export type PostPrivacy = 'public' | 'private'

export type Post = {
  __entity_type: 'post'
  id: string
  slug?: string | null
  post_type: PostType
  title: string
  markdown: string
  ai_summary_markdown: string
  html?: string
  parent_id?: string | null
  root_id: string | null
  created_by_id: string | null
  created_by?: BasicUser | null
  updated_by?: BasicUser | null
  created_at: Date
  updated_at: Date
  updated_by_id: string | null
  deleted_at: Date | null
  deleted_by_id: string | null
  archived_at: Date | null
  archived_by_id: string | null
  approved_at: Date | null
  rejected_at: Date | null
  in_review_at: Date | null
  locked_at: Date | null
  locked_by_id: string | null
  broadcast: PostBroadcast
  privacy: PostPrivacy
  is_anonymous: boolean
  community_id: string | null
  clearance_status: ClearanceStatus
  clearance_reason: string | null
  clearance_updated_at: Date | null
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
    updated_at: Date
    category_slug?: string | null
    topic?: {
      __entity_type: 'topic'
      id: string
      name: string
      slug: string
      markdown: string
      topic_type: string
      created_at: Date
    }
  }> | null
  post_related_topics?: Array<{
    __entity_type: 'topic'
    id: string
    name: string
    slug: string
    topic_type: string
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
    topic_type: 'topic' | 'referral_program' | 'card'
    example_referral_link: string | null
    landing_page_urls: string[]
    approval_error_message: string | null
    status: TopicRecommendationStatus
    reviewed_at: Date | null
    reviewed_by_id: string | null
    rejection_reason: string | null
    created_topic_id: string | null
    created_topic_slug?: string | null
  } | null
  data_point_vertical?: string | null
  structured_data?: unknown | null
  declared_language?: string | null
  lingua_rs_detected_language?: string | null
  url_id?: string | null
  can_edit_content?: boolean
}

export type PostMetrics = {
  __entity_type: 'post_metrics'
  id: string
  count: {
    descendants: number
    children: number
    ancestors: number
  }
  updated_at: Date
  bookmarks: {
    follow: number
    save: number
  }
}

export type PostElection = {
  __entity_type: 'post_election'
  id: string
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

export type CreatePostUpdates = {
  post_type?: PostType
  title?: string
  markdown?: string
  slug?: string
  url_id?: string
  url?: string
  root_id?: string
  parent_id?: string
  broadcast?: PostBroadcast
  privacy?: PostPrivacy
  is_anonymous?: boolean
  community_id?: string
  images?: Array<{ image_id: string; order_index: number; caption?: string }>
  archive?: boolean // true = archive, false = unarchive
  data_point_vertical?: string
  structured_data?: unknown
  declared_language?: string | null
  categories?: Array<{ type: 'topic'; topic_id: string } | { type: 'hashtag'; hashtag: string }>
}

export type UpdatePostChanges = CreatePostUpdates & {
  ai_summary_markdown?: string
}

export type CreatePostInput = Omit<CreatePostUpdates, 'archive'> & {
  review_topic_ratings?: Array<{
    topic_id: string
    rating: number
  }>
}
