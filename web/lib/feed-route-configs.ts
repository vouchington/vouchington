/**
 * Route configurations for feed pages (/feed/posts, /feed/news, etc.)
 * Config data lives in feed-route-config-data.ts to stay within the 200-line limit.
 */
import { feedRouteConfigData } from './feed-route-config-data'

export const FEED_PAGE_LIMIT = 25

import type {
  FeedCategory,
  NewsFeedRouteConfig,
  PodcastFeedRouteConfig,
  PostFeedRouteConfig,
  ReferralLinksFeedRouteConfig,
  VideoFeedRouteConfig,
} from './feed-route-config-types'
export type {
  FeedCategory,
  NewsFeedType,
  PodcastFeedRouteConfig,
  PostFeedRouteConfig,
  ReferralLinksFeedRouteConfig,
  VideoFeedRouteConfig,
  NewsFeedRouteConfig,
} from './feed-route-config-types'

type FeedRouteConfig =
  | PostFeedRouteConfig
  | NewsFeedRouteConfig
  | PodcastFeedRouteConfig
  | VideoFeedRouteConfig
  | ReferralLinksFeedRouteConfig

type AnyFeedRouteConfig = FeedRouteConfig

type FeedRouteKey = keyof typeof feedRouteConfigData

const feedSubFilterOrder: Record<FeedCategory, FeedRouteKey[]> = {
  posts: ['posts', 'posts/friends', 'posts/topics'],
  news: ['news', 'news/friends', 'news/sources', 'news/topics'],
  podcasts: ['podcasts', 'podcasts/friends', 'podcasts/sources', 'podcasts/topics'],
  videos: ['videos', 'videos/friends', 'videos/sources', 'videos/topics'],
  'referral-links': ['referral-links', 'referral-links/mutual'],
}

const feedSubFiltersByCategory: Record<FeedCategory, AnyFeedRouteConfig[]> = {
  posts: feedSubFilterOrder.posts.map(key => feedRouteConfigData[key]),
  news: feedSubFilterOrder.news.map(key => feedRouteConfigData[key]),
  podcasts: feedSubFilterOrder.podcasts.map(key => feedRouteConfigData[key]),
  videos: feedSubFilterOrder.videos.map(key => feedRouteConfigData[key]),
  'referral-links': feedSubFilterOrder['referral-links'].map(key => feedRouteConfigData[key]),
}

export function getFeedSubFilters(category: FeedCategory): AnyFeedRouteConfig[] {
  return feedSubFiltersByCategory[category]
}
