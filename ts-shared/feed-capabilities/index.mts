export const FEED_CAPABILITY_CATALOG = {
  postFeedTypes: ['follow_users', 'follow_topics', 'any', 'all'],
  rssFeedItemFeedTypes: ['follow_users', 'follow_rss_feeds', 'follow_topics', 'any', 'all'],
  communityNewsFeedTypes: ['any', 'follow_rss_feeds', 'follow_topics'],
  filterablePostTypes: [
    'discussion',
    'review',
    'data_point',
    'comment',
    'link',
    'article',
    'blog_post',
    'story',
  ],
  rssPostTypes: ['discussion', 'review', 'data_point'],
  trendingPostTypes: ['discussion', 'review', 'data_point', 'story'],
  feedTimeRanges: ['1d', '1w', '1m', '1y', 'all'],
  trendingTimeRanges: ['day', 'week', 'month'],
} as const

export const VALID_POST_FEED_TYPES = FEED_CAPABILITY_CATALOG.postFeedTypes
export const VALID_RSS_FEED_ITEM_FEED_TYPES = FEED_CAPABILITY_CATALOG.rssFeedItemFeedTypes
export const VALID_COMMUNITY_NEWS_FEED_TYPES = FEED_CAPABILITY_CATALOG.communityNewsFeedTypes
export const VALID_FILTERABLE_POST_TYPES = FEED_CAPABILITY_CATALOG.filterablePostTypes
export const VALID_RSS_POST_TYPES = FEED_CAPABILITY_CATALOG.rssPostTypes
export const VALID_TRENDING_POST_TYPES = FEED_CAPABILITY_CATALOG.trendingPostTypes
export const VALID_FEED_TIME_RANGES = FEED_CAPABILITY_CATALOG.feedTimeRanges
export const VALID_TRENDING_TIME_RANGES = FEED_CAPABILITY_CATALOG.trendingTimeRanges

export type PostFeedType = (typeof VALID_POST_FEED_TYPES)[number]
export type RssFeedItemFeedType = (typeof VALID_RSS_FEED_ITEM_FEED_TYPES)[number]
export type CommunityNewsFeedType = (typeof VALID_COMMUNITY_NEWS_FEED_TYPES)[number]
export type FilterablePostType = (typeof VALID_FILTERABLE_POST_TYPES)[number]
export type RssPostType = (typeof VALID_RSS_POST_TYPES)[number]
export type TrendingPostType = (typeof VALID_TRENDING_POST_TYPES)[number]
export type FeedTimeRange = (typeof VALID_FEED_TIME_RANGES)[number]
export type TrendingTimeRange = (typeof VALID_TRENDING_TIME_RANGES)[number]

export function isCatalogValue<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  // Widening cast is safe: .includes() only needs string equality;
  // const-generic tuple types narrow .includes() in ways that reject valid args.
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}
