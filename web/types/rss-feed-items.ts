/**
 * RSS feed item types for frontend rendering
 * Mirrors backend/services/rss-feed-items/types.mts
 */

import type { PaginatedResponse } from './api-responses/pagination-and-entities'
import type { Post, PostMetrics } from './posts'
import type { PublicUser } from './user'
import type { PaginatedResult } from '@voucha/types/pagination'
import type { PodcastShow } from './rss-feeds'
import type { UrlEmbed } from './api-responses/posts-topics-and-feeds'

interface RssFeedItemData {
  link: string
  guid: string
  pubDate?: string
  isoDate?: string
  title?: string
  content?: string
  summary?: string
  description?: string
  contentSnippet?: string
  'content:encodedSnippet'?: string
  'content:encoded'?: string
  'media:description'?: string
  'media:starRating'?: {
    average?: number
    count?: number
    min?: number
    max?: number
  }
  'media:statistics'?: {
    views?: number
  }
  categories?: string[]
  // Media fields
  media_type?: 'article' | 'audio' | 'video'
  enclosure_url?: string
  enclosure_type?: string
  enclosure_length?: number
  duration_seconds?: number
  thumbnail_url?: string
  video_id?: string
  video_platform?: string
  player_url?: string
  [key: string]: unknown
}

interface RssFeedItemUrl {
  id: string
  url: string
}

interface RssFeedItemTopic {
  id: string
  name: string
  slug: string
  topic_type: string
}

interface RssFeedItemRssFeed {
  __entity_type: 'rss_feed'
  id: string
  title: string
  is_discoverable: boolean
  topic: RssFeedItemTopic
  feed_type: 'article' | 'podcast' | 'video' | 'mixed'
  /** Podcast show metadata; non-null when feed_type='podcast' and itunes data is present. */
  podcast_show?: PodcastShow | null
}

export interface RssFeedItemElection {
  __entity_type: 'rss_feed_item_election'
  id: string
  votes_score_net: number
  votes_count_up: number
  votes_count_down: number
}

export interface RssFeedItem {
  __entity_type: 'rss_feed_item'
  id: string
  published_at: string
  lingua_rs_detected_language: string | null
  data: RssFeedItemData
  url: RssFeedItemUrl
  rss_feed: RssFeedItemRssFeed
  rss_feed_sources: RssFeedItemRssFeed[]
  categories: Array<{
    id: string | null
    category_text: string
    topic: RssFeedItemTopic | null
    hashtag: {
      id: string
      key: string
      display_token: string
      topic_id: string | null
    } | null
    votes_score_net: number | null
  }>
}

export interface Story {
  id: string
  title: string | null
  cluster_reason: string | null
  published_at: string | null
  official_rss_feed_item_id: string | null
}

type RssFeedItemSearchResult = PaginatedResult<'rss_feed_item'> & {
  published_at: string
  story_id: string | null
  entity_id?: string
  delivery_type?: 'direct' | 'share'
  shared_by_user_id?: string
  shared_at?: string
}

export type RssFeedItemsFeedResponseBody = PaginatedResponse<RssFeedItemSearchResult> & {
  rss_feed_items: Record<string, RssFeedItem>
  // Election summaries are sidecars, not fields on rss_feed_items.
  rss_feed_item_elections: Record<string, RssFeedItemElection>
  // Sanitized HTML for each item's best content field, keyed by item ID.
  // Items with no content or empty sanitized output are omitted.
  rss_feed_item_content_html?: Record<string, string>
  // Proxied thumbnail URLs keyed by item ID. Values are absolute image-host /sideload/ URLs.
  // Items with no thumbnail are omitted.
  rss_feed_item_thumbnail_url?: Record<string, string>
  /** Embed sidecars are keyed by RSS item id and share the post URL-embed contract. */
  rss_feed_item_embeds?: Record<string, UrlEmbed>

  stories?: Record<string, Story>
  story_member_ids?: Record<string, string[]>
  story_post_ids?: Record<string, string>
  related_posts_by_url_id?: Record<string, string[]>
  posts?: Record<string, Post>
  posts_metrics?: Record<string, PostMetrics>
  users?: Record<string, PublicUser>
  rss_feed_bookmarks?: Record<string, Record<string, boolean>>
}
