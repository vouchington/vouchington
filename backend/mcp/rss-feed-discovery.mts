import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { getRecommendedRssFeeds } from '@services/recommended-rss-feeds/get-recommendations'
import type {
  RecommendationSource,
  RecommendedRssFeedResult,
} from '@services/recommended-rss-feeds/types'
import { getTrendingRssFeeds } from '@services/trending-rss-feeds/get-trending-rss-feeds'
import type { TrendingRssFeedMetric } from '@services/trending-rss-feeds/types'
import { findPageOrNull, INVALID_CURSOR_RESULT } from './paged-search.mts'
import { pageInfoSchema } from './mcp-read-output.mts'
import { closedObject, foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type PageArgs = { limit?: number; after?: string }
type TrendingArgs = PageArgs & { time_range?: 'day' | 'week' | 'month'; min_score?: number }
type RecommendedArgs = PageArgs & { source?: RecommendationSource }
type PageInfo = { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
type DiscoveryResult<T> =
  | { success: true; results: T[]; page_info: PageInfo }
  | typeof INVALID_CURSOR_RESULT
const MAX_LIMIT = 100
const pageProperties = {
  limit: { type: 'integer', minimum: 1, description: 'Defaults to 20; clamped to 100.' },
  after: { type: 'string', description: 'Previous page_info.end_cursor.' },
}
const feedIdSchema = pickProperties('ViewRssFeed', ['id']).id!
const trendingSchema = closedObject({
  id: feedIdSchema,
  trending_score: { type: 'number' },
  follow_count: { type: 'number' },
  item_count: { type: 'number' },
})
const recommendedSchema = closedObject({
  id: feedIdSchema,
  recommendation_score: { type: 'number' },
  recommendation_reasons: { type: 'array', items: { type: 'string' } },
})

export const getTrendingRssFeedsTool: Tool<TrendingArgs, DiscoveryResult<TrendingRssFeedMetric>> = {
  schema: {
    name: 'get_trending_rss_feeds',
    type: 'function',
    description:
      'List trending RSS feed IDs, scores and counts. Use get_rss_feed for details. Returns at most 100 per page and a cursor for the next page.',
    parameters: {
      type: 'object',
      properties: {
        ...pageProperties,
        time_range: { type: 'string', enum: ['day', 'week', 'month'] },
        min_score: { type: 'number', minimum: 0 },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Trending RSS Feeds',
    plan: 'free',
    requiredScopes: { mcp: ['rss-feeds:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/rss-feeds/trending' }],
    outputSchema: foundOrNotFoundSchema({
      results: { type: 'array', items: trendingSchema },
      page_info: pageInfoSchema(),
    }),
  },
  function: (_currentUser: BasicUser) => async (args: TrendingArgs) => {
    const page = await findPageOrNull(args.after, () =>
      getTrendingRssFeeds({
        timeRange: args.time_range ?? 'week',
        minScore: args.min_score,
        limit: clampToolLimit(args.limit, 20, MAX_LIMIT),
        after: args.after,
      }),
    )
    if (!page) return INVALID_CURSOR_RESULT
    return { success: true, results: page.results, page_info: page.page_info }
  },
}

export const getRecommendedRssFeedsTool: Tool<
  RecommendedArgs,
  DiscoveryResult<RecommendedRssFeedResult>
> = {
  schema: {
    name: 'get_recommended_rss_feeds',
    type: 'function',
    description:
      'List RSS feed recommendations for the current user, with scores and reasons. Use get_rss_feed for details. Returns at most 100 per page and a cursor for the next page.',
    parameters: {
      type: 'object',
      properties: {
        ...pageProperties,
        source: { type: 'string', enum: ['friends', 'topic', 'collaborative', 'all'] },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Recommended RSS Feeds',
    plan: 'free',
    requiredScopes: { mcp: ['rss-feeds:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/rss-feeds/recommended' }],
    outputSchema: foundOrNotFoundSchema({
      results: { type: 'array', items: recommendedSchema },
      page_info: pageInfoSchema(),
    }),
  },
  function: (currentUser: BasicUser) => async (args: RecommendedArgs) => {
    const page = await findPageOrNull(args.after, () =>
      getRecommendedRssFeeds(currentUser.id, {
        source: args.source ?? 'all',
        limit: clampToolLimit(args.limit, 20, MAX_LIMIT),
        after: args.after,
      }),
    )
    if (!page) return INVALID_CURSOR_RESULT
    return { success: true, results: page.results, page_info: page.page_info }
  },
}

export const rssFeedDiscoveryTools = [getTrendingRssFeedsTool, getRecommendedRssFeedsTool]
