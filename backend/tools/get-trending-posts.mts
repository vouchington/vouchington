import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { getTrendingPosts } from '@services/trending-posts/get-trending-posts'
import { clampToolLimit } from './search-system.mts'
import {
  VALID_TRENDING_POST_TYPES,
  VALID_TRENDING_TIME_RANGES,
  type TrendingPostType,
  type TrendingTimeRange,
} from '@ts-shared/feed-capabilities'

const MAX_LIMIT = 10
const DEFAULT_LIMIT = 10

type ToolArgs = {
  time_range?: TrendingTimeRange
  post_type?: TrendingPostType
  topic_id?: string
  limit?: number
}

type TrendingPostEntry = {
  id: string
  trending_score: number
}

type ToolResult = {
  success: true
  time_range: string
  results: TrendingPostEntry[]
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_trending_posts',
    type: 'function',
    description:
      'Get posts that are trending based on time-decay voting. Useful for "what discussions are hot this week?" or "what are the most popular reviews for this card?". Optionally filter by post type or topic.',
    parameters: {
      type: 'object',
      properties: {
        time_range: {
          type: 'string',
          enum: [...VALID_TRENDING_TIME_RANGES],
          description: 'Time window for trending calculation. Defaults to "week".',
        },
        post_type: {
          type: 'string',
          enum: [...VALID_TRENDING_POST_TYPES],
          description: 'Optionally filter to a specific post type.',
        },
        topic_id: {
          type: 'string',
          description: 'Optionally filter to posts tagged with a specific topic.',
        },
        limit: {
          type: 'number',
          description: `Maximum number of results to return (1-${MAX_LIMIT}). Defaults to ${DEFAULT_LIMIT}.`,
        },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get Trending Posts',
    requiredScopes: { mcp: ['posts:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/trending-posts' }],
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const timeRange = args.time_range ?? 'week'
      const limit = clampToolLimit(args.limit, DEFAULT_LIMIT, MAX_LIMIT)

      const { results } = await getTrendingPosts({
        timeRange,
        postType: args.post_type,
        topicId: args.topic_id,
        limit,
      })

      return {
        success: true,
        time_range: timeRange,
        results,
      }
    },
}

export default tool
