/* oxlint-disable max-lines -- post/topic/feed response contracts stay colocated for fixture exactness checks */
import type * as Api from './shared'
import type { PaginatedResponse } from './pagination-and-entities'

type Post = Api.Post
type PostMetrics = Api.PostMetrics
type PostSearchResult = Api.PostSearchResult
type PostElection = Api.PostElection
type ElectionVote = Api.ElectionVote
type AuthorAside = Api.AuthorAside
type Topic = Api.Topic
type TopicContentUpdate = Api.TopicContentUpdate
type TopicMetrics = Api.TopicMetrics
type TopicSearchResult = Api.TopicSearchResult
type TopicElection = Api.TopicElection
type TopicDataPointInsights = Api.TopicDataPointInsights
type AgentModeration = Api.AgentModeration
type AgentModerationElection = Api.AgentModerationElection
type PublicUser = Api.PublicUser
type RssFeedItem = Api.RssFeedItem
type RssFeedItemElection = Api.RssFeedItemElection
type Community = Api.BackendCommunity

/** Lossless JSON object. Presentation code narrows individual values before use. */
export type CrawlerHtmlStructuredObject = Record<string, unknown>

export type ResolvedEmbed = {
  kind: 'article' | 'player'
  requestedUrl: string
  resolvedUrl: string
  title: string | null
  description: string | null
  author: { name: string | null; url: string | null } | null
  provider: {
    key: string | null
    name: string | null
    url: string | null
    resourceId: string | null
  } | null
  thumbnail: { url: string; width: number | null; height: number | null } | null
  player: { url: string; width: number | null; height: number | null } | null
}

/**
 * Rich media embed for a link post. Shared between the list-response sidecar
 * (post_link_embeds) and the single-post response (link_embed).
 */
export type UrlEmbed = {
  rss_feed_item_id: string | null
  source_url: string | null
  media_type: 'article' | 'audio' | 'video'
  video_id: string | null
  video_platform: string | null
  player_url: string | null
  player_width: number | null
  player_height: number | null
  enclosure_url: string | null
  enclosure_type: string | null
  duration_seconds: number | null
  thumbnail_url: string | null
  title: string | null
  description: string | null
  provider_name: string | null
  markdown: string | null
  show_id: string | null
  show_title: string | null
  show_topic_slug: string | null
  show_topic_type: string | null
  embed_metadata: ResolvedEmbed | null
  meta_tags: CrawlerHtmlStructuredObject | null
  embed_oembed_url: string | null
  embed_oembed_resolved_at: string | null
}

/**
 * Posts search/list response body
 */

export type PostsResponseBody = PaginatedResponse<PostSearchResult> & {
  posts: Record<string, Post>
  posts_metrics: Record<string, PostMetrics>
  post_elections?: Record<string, PostElection>
  communities?: Record<string, Pick<Community, 'id' | 'name' | 'slug'>>

  markdown_to_html?: Record<string, string>
  post_moderations?: Record<string, AgentModeration[]>
  agent_moderation_elections?: Record<string, AgentModerationElection>
  users?: Record<string, PublicUser>
  post_link_embeds?: Record<string, UrlEmbed>
}

/**
 * Topics search/list response body
 */

export type TopicsResponseBody = PaginatedResponse<TopicSearchResult> & {
  topics: Record<string, Topic>
  topics_metrics: Record<string, TopicMetrics>
  topic_elections?: Record<string, TopicElection>

  markdown_to_html?: Record<string, string>
}

export interface PublisherTypeTopic {
  id: string
  slug: string
  label: string
}

export interface PublisherTypesResponseBody {
  publisher_types: PublisherTypeTopic[]
}

export interface TopicsSearchResponseBody extends TopicsResponseBody {
  election_votes?: Record<string, ElectionVote>
}

export type ReferralProgramTopicsResponseBody = TopicsResponseBody & {
  topic_elections: Record<string, TopicElection>
  election_votes: Record<string, ElectionVote>
}

/**
 * Single post response
 */

export interface PostResponseBody {
  post: Post
  html: string
  author_aside?: AuthorAside | null
  post_metrics?: PostMetrics
  post_election?: PostElection
  communities?: Record<string, Pick<Community, 'id' | 'name' | 'slug'>>

  election_vote?: ElectionVote
  bookmarks?: Record<string, Record<string, boolean>>
  link_embed?: UrlEmbed | null
}

/**
 * Single topic response
 */

export interface TopicResponseBody {
  topic: Topic
  topic_redirect?: {
    source_topic_id: string
    source_topic_slug: string
    source_topic_type: Topic['topic_type']
    destination_topic_id: string
  }
  html: string
  topic_metrics?: TopicMetrics
  topic_election?: TopicElection | null

  election_vote?: ElectionVote | null
  topic_content_update?: TopicContentUpdate | null
  topic_categories: string[]
  topic_parents?: Topic[]
  topic_children?: Topic[]
  bookmarks?: Record<string, Record<string, boolean>>
}

/**
 * Topic compare response
 */

export interface TopicCompareResponseBody {
  topics: Record<string, Topic>
  topic_metrics: Record<string, TopicMetrics>
  topic_elections: Record<string, TopicElection>
  topic_categories: Record<string, string[]>
  data_point_insights: Record<string, TopicDataPointInsights>
  bookmarks?: Record<string, Record<string, boolean>>
  election_votes?: Record<string, ElectionVote>
}

// Single-entity mutation response types

export interface PostMutationResponseBody {
  post: Post
  community_post_review?: {
    community_id: string
    post_id: string
    approved_at: string | null
    rejected_at: string | null
    unpublished_at: string | null
  } | null
}

export interface TopicMutationResponseBody {
  topic: Topic
}

export type TopicMergeResponseBody = TopicMutationResponseBody & {
  topic_merge: {
    source_topic_id: string
    destination_topic_id: string
    moved_aliases: string[]
  }
}

export interface RssFeedResponseBody {
  rss_feed: Record<string, unknown>
}

export interface RssFeedRefreshResponseBody {
  success: true
  message: string
  rss_feed_id: string
  force: boolean
}

export interface CreateSourceResponseBody {
  status: 'created' | 'upvoted'
  rss_feed_id: string
  topic_id: string
  topic_slug: string
}

export interface FollowContextUsers {
  total: number
  users: PublicUser[]
}

export interface EntityFollowContextResponseBody {
  positive_by_following: FollowContextUsers
  negative_by_following: FollowContextUsers
}

export type TopicFollowContextResponseBody = EntityFollowContextResponseBody & {
  following_topic_followers: FollowContextUsers
}

export interface UserVouchContextResponseBody {
  positive_by_following: FollowContextUsers
  negative_by_following: FollowContextUsers
  election_vote: ElectionVote | null
}

export interface RssFeedItemResponseBody {
  rss_feed_item: RssFeedItem
  rss_feed_item_election?: RssFeedItemElection | null
  content_html: string | null
  rss_feed_item_thumbnail_url?: Record<string, string>
  rss_feed_item_embeds?: Record<string, UrlEmbed>

  election_vote?: ElectionVote | null
  bookmarks?: Record<string, Record<string, boolean>>
}
