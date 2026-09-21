import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { getTrendingTopics } from '@services/trending-topics/get-trending-topics'
import { clampToolLimit } from './search-system.mts'

const MAX_LIMIT = 25
const DEFAULT_LIMIT = 10

type ToolArgs = {
  time_range?: 'day' | 'week' | 'month'
  limit?: number
}

type TrendingTopicEntry = {
  id: string
  trending_score: number
  post_tag_count: number
  rss_item_tag_count: number
}

type ToolResult = {
  success: true
  time_range: string
  results: TrendingTopicEntry[]
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_trending_topics',
    type: 'function',
    description:
      'Get topics (cards, bank accounts, rewards programs, etc.) that are trending based on recent post and news activity. Useful for answering "what credit cards are popular right now?" or "what topics are being discussed?". Returns topic IDs with trending scores — use get_topic_details to get full card information.',
    parameters: {
      type: 'object',
      properties: {
        time_range: {
          type: 'string',
          enum: ['day', 'week', 'month'],
          description: 'Time window for trending calculation. Defaults to "week".',
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
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/trending-topics' }],
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const timeRange = args.time_range ?? 'week'
      const limit = clampToolLimit(args.limit, DEFAULT_LIMIT, MAX_LIMIT)

      const { results } = await getTrendingTopics({ timeRange, limit })

      return {
        success: true,
        time_range: timeRange,
        results,
      }
    },
}

export default tool
