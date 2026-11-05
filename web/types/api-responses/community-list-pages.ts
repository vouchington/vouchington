import type * as Api from './shared'
import type { PublicUrl } from './urls-onboarding-and-trends'

type Post = Api.Post
type PostMetrics = Api.PostMetrics
type Hostname = Api.Hostname
type Topic = Api.Topic
type TopicMetrics = Api.TopicMetrics
type ViewRssFeed = Api.ViewRssFeed
type Serialized<T> = Api.Serialized<T>
type CommunityListItem = Serialized<Api.BackendCommunityListItem>
type PageInfo = Api.PageInfo

interface CommunityListItemResult {
  __entity_type: 'community_list_item'
  id: string
}

export interface CommunityListTopicsResponseBody {
  results: CommunityListItemResult[]
  page_info: PageInfo
  community_list_items: Record<string, CommunityListItem>
  topics: Record<string, Topic>
  topics_metrics: Record<string, TopicMetrics>
}

export interface CommunityListRssFeedsResponseBody {
  results: CommunityListItemResult[]
  page_info: PageInfo
  community_list_items: Record<string, CommunityListItem>
  rss_feeds: Record<string, ViewRssFeed>
}

export interface CommunityListPostsResponseBody {
  results: CommunityListItemResult[]
  page_info: PageInfo
  community_list_items: Record<string, CommunityListItem>
  posts: Record<string, Post>
  posts_metrics: Record<string, PostMetrics>
}

export interface CommunityListDomainsResponseBody {
  results: CommunityListItemResult[]
  page_info: PageInfo
  community_list_items: Record<string, CommunityListItem>
  url_hostnames: Record<string, Hostname>
}

export interface CommunityListUrlsResponseBody {
  results: CommunityListItemResult[]
  page_info: PageInfo
  community_list_items: Record<string, CommunityListItem>
  urls: Record<string, PublicUrl>
}

export interface CommunityListItemCountsResponseBody {
  topic: number
  rss_feed: number
  post: number
  url_hostname: number
  url: number
}

/**
 * Merged type for all community list page responses — used by client components
 * that need to accumulate pages across all entity types (e.g. usePaginatedList).
 */
export interface CommunityListPageData {
  page_info: PageInfo
  results: CommunityListItemResult[]
  community_list_items: Record<string, CommunityListItem>
  topics?: Record<string, Topic>
  topics_metrics?: Record<string, TopicMetrics>
  rss_feeds?: Record<string, ViewRssFeed>
  posts?: Record<string, Post>
  posts_metrics?: Record<string, PostMetrics>
  url_hostnames?: Record<string, Hostname>
  urls?: Record<string, PublicUrl>
}
