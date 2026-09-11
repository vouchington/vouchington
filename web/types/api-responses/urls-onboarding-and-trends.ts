import type * as Api from './shared'
import type { CrawlerHtmlStructuredObject, ResolvedEmbed } from './posts-topics-and-feeds'

type HostnameListResponse = Api.HostnameListResponse
type Topic = Api.Topic
type TopicMetrics = Api.TopicMetrics
type PublicUser = Api.PublicUser
type ViewRssFeed = Api.ViewRssFeed
type Serialized<T> = Api.Serialized<T>
type BackendReferralClickLogEntry = Api.BackendReferralClickLogEntry
type PageInfo = Api.PageInfo

export interface PublicUrl {
  __entity_type: 'url'
  id: string
  url: string
  pathname: string
  search_params: Record<string, string>
  canonical_url_id: string | null
  hostname: {
    __entity_type: 'hostname'
    id: string
    hostname: string
    topic_id: string | null
  } | null
}

export interface PaidSafeCrawlHistory {
  __entity_type: 'crawl'
  id: string
  response_status_code: number | null
  completed_at: string | null
  title: string | null
  created_at: string
  lang: string | null
}

export type CrawlResponse = PaidSafeCrawlHistory & {
  markdown?: string | null
  meta_tags?: CrawlerHtmlStructuredObject | null
  embed_metadata?: ResolvedEmbed | null
  embed_oembed_url?: string | null
  embed_oembed_resolved_at?: string | null
}

export interface UrlDetailResponseBody {
  url: PublicUrl
  latest_crawl: CrawlResponse | null
  can_view_latest_crawl: boolean
  can_view_crawl_history: boolean
  can_trigger_crawl: boolean
  url_type: 'rss_feed' | 'referral_link' | 'url'
  rss_feed_id: string | null
}

export interface UrlListResult {
  __entity_type: 'url'
  id: string
  url: string
  pathname: string
  hostname: { id: string; hostname: string } | null
}

export interface UrlListResponseBody {
  results: UrlListResult[]
  page_info: PageInfo
}

export interface CrawlListResult {
  __entity_type: 'crawl'
  id: string
  response_status_code: number | null
  completed_at: string | null
  created_at: string
}

export interface CrawlListResponseBody {
  results: CrawlListResult[]
  page_info: PageInfo
}

export interface CrawlDetailResponseBody {
  crawl: CrawlResponse
  og_image_sideload?: string | null
}

export type ContributionGatingReason = 'account_too_new' | 'email_verification_required'
export type ContributionLimitAction =
  | 'topic'
  | 'topic_recommendation'
  | 'discussion'
  | 'review'
  | 'comment'
  | 'data_point'
  | 'article'
  | 'blog_post'
  | 'community'
  | 'rss_feed'
  | 'post_rating'
export type ContributionLimitTier = 'just_joined' | 'free' | 'plus' | 'pro' | 'admin'

export interface ContributionStatusResponseBody {
  contribution_status: {
    allowed: boolean
    reason?: ContributionGatingReason
    gated_until?: string
  }
  daily_quota: {
    limit: number
    used: number
    window_seconds?: number
  }
  action_limit?: {
    action: ContributionLimitAction
    tier: ContributionLimitTier
    allowed: boolean
    short_window: {
      limit: number
      used: number
      window_seconds: number
    }
    daily_window: {
      limit: number
      used: number
      window_seconds: number
    }
  }
  admission: {
    allowed: boolean
    reason?: 'global_limit' | 'type_limit'
    retry_after_seconds?: number
  }
}

export type TopHostnamesResponse = HostnameListResponse

export interface TrendingFeedsResponse {
  results: Array<{ id: string; trending_score: number; follow_count: number; item_count: number }>
  page_info: PageInfo
  rss_feeds: Record<string, ViewRssFeed>
}

export interface TrendingTopicsResponse {
  results: Array<{
    id: string
    trending_score: number
    post_tag_count: number
    rss_item_tag_count: number
  }>
  page_info: PageInfo
  topics: Record<string, Topic>
  topics_metrics: Record<string, TopicMetrics>
}

export type ReferralClickLogEntry = Serialized<BackendReferralClickLogEntry>

export interface ReferralClickLogResult {
  __entity_type: 'referral_click_log'
  id: string
}

export interface ReferralClickLogResponseBody {
  results: ReferralClickLogResult[]
  clicks: Record<string, ReferralClickLogEntry>
  users: Record<string, PublicUser>
  page_info: PageInfo
}

export interface FriendRecommendationResult {
  __entity_type: 'user'
  id: string
  provider: 'facebook' | 'x' | 'github'
  provider_friend_name: string
}

export interface FriendRecommendationsResponseBody {
  results: FriendRecommendationResult[]
  page_info: PageInfo
  users: Record<string, PublicUser>
}

export interface TrendingReferralProgram {
  id: string
  trending_score: number
  link_count: number
}

export interface TrendingReferralProgramsResponseBody {
  referral_programs: TrendingReferralProgram[]
  page_info: PageInfo
}
