import type { ViewUrl } from '@services/urls/types'
import type { ViewRssFeed } from '@voucha/types/entities/rss-feed'
import type { Topic } from '@services/topics/types'
import type { RssFeedItemsResult } from '@voucha/types/entities/rss-feed-item-search'

export type ViewRssFeedItem = {
  __entity_type: 'rss_feed_item'
  id: string // UUIDv7 routing-safe identifier
  guid: string
  published_at: Date
  media_type?: 'article' | 'audio' | 'video'
  data: RssFeedItemToUpsert
  url: ViewUrl
  rss_feed: ViewRssFeed
  rss_feed_sources?: ViewRssFeed[]
  categories: Array<{
    id: string | null
    category_text: string
    topic: Topic | null
    hashtag?: {
      id: string
      key: string
      display_token: string
      topic_id: string | null
    } | null
    votes_score_net: number | null
  }>
}

export type { RssFeedItemsResult }

// Normalized from feedsmith parseFeed() (RSS, Atom, JSON Feed)
export type RssFeedItemToUpsert = {
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
  chapters_url?: string
  chapters_type?: string
  video_id?: string
  video_platform?: string
  player_url?: string
  [key: string]: unknown
}
