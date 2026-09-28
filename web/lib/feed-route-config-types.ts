import type {
  PostFeedType as CatalogPostFeedType,
  RssFeedItemFeedType,
} from '@ts-shared/feed-capabilities'
import type { MessageKey } from '@ts-shared/ui-messages'

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
