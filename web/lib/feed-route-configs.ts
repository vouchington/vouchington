/**
 * Route configurations for feed pages (/feed/posts, /feed/news, etc.)
 * Config data lives in feed-route-config-data.ts to stay within the 200-line limit.
 */
import type {
  PostFeedType as CatalogPostFeedType,
  RssFeedItemFeedType,
} from '@ts-shared/feed-capabilities'
import type { MessageKey } from '@ts-shared/ui-messages'
import { feedRouteConfigData as _feedRouteConfigs } from './feed-route-config-data'

export const FEED_PAGE_LIMIT = 25

export type FeedCategory = 'posts' | 'news' | 'podcasts' | 'videos' | 'referral-links'

export type PostFeedType = Exclude<CatalogPostFeedType, 'all'>
export type NewsFeedType = Exclude<RssFeedItemFeedType, 'all'>
export type ReferralLinksFeedType = 'follow_users' | 'mutual_follows'

export interface PostFeedRouteConfig {
  title: MessageKey
  description: MessageKey
  category: 'posts'
  feedType: PostFeedType
  path: string
  label: MessageKey
}

export interface NewsFeedRouteConfig {
  title: MessageKey
  description: MessageKey
  category: 'news'
  feedType: NewsFeedType
  path: string
  label: MessageKey
}

export interface PodcastFeedRouteConfig {
  title: MessageKey
  description: MessageKey
  category: 'podcasts'
  feedType: NewsFeedType
  path: string
  label: MessageKey
}

export interface VideoFeedRouteConfig {
  title: MessageKey
  description: MessageKey
  category: 'videos'
  feedType: NewsFeedType
  path: string
  label: MessageKey
}

export type ReferralLinksFeedRouteConfig = {
  title: MessageKey
  description: MessageKey
  category: 'referral-links'
  feedType: ReferralLinksFeedType
  path: string
  label: MessageKey
}

type FeedRouteConfig =
  | PostFeedRouteConfig
  | NewsFeedRouteConfig
  | PodcastFeedRouteConfig
  | VideoFeedRouteConfig
  | ReferralLinksFeedRouteConfig

type AnyFeedRouteConfig = FeedRouteConfig

export const feedRouteConfigs = _feedRouteConfigs

type FeedRouteKey = keyof typeof feedRouteConfigs

const feedSubFilterOrder: Record<FeedCategory, FeedRouteKey[]> = {
  posts: ['posts', 'posts/friends', 'posts/topics'],
  news: ['news', 'news/friends', 'news/sources', 'news/topics'],
  podcasts: ['podcasts', 'podcasts/friends', 'podcasts/sources', 'podcasts/topics'],
  videos: ['videos', 'videos/friends', 'videos/sources', 'videos/topics'],
  'referral-links': ['referral-links', 'referral-links/mutual'],
}

const feedSubFiltersByCategory: Record<FeedCategory, AnyFeedRouteConfig[]> = {
  posts: feedSubFilterOrder.posts.map(key => feedRouteConfigs[key]),
  news: feedSubFilterOrder.news.map(key => feedRouteConfigs[key]),
  podcasts: feedSubFilterOrder.podcasts.map(key => feedRouteConfigs[key]),
  videos: feedSubFilterOrder.videos.map(key => feedRouteConfigs[key]),
  'referral-links': feedSubFilterOrder['referral-links'].map(key => feedRouteConfigs[key]),
}

export function getFeedSubFilters(category: FeedCategory): AnyFeedRouteConfig[] {
  return feedSubFiltersByCategory[category]
}
