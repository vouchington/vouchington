import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { getTrendingTopics, trendingTopicsPaginationParser } from '@services/trending-topics'
import type { TrendingTopicsResult } from '@services/trending-topics/types'
import { objectSchema, successSchema } from './output-schema-shapes.mts'
import { componentSchema } from './route-response-schema.mts'

const TIME_RANGES = ['day', 'week', 'month'] as const

type ToolArgs = {
  time_range?: (typeof TIME_RANGES)[number]
  after?: string
  limit?: number
}

type ToolResult = { success: true; time_range: string } & TrendingTopicsResult

const count = { type: 'integer', minimum: 0 }

// The REST twin documents no response body, so the tool owns this schema. `page_info` is the
// generated PageInfo component, the same one the posts route documents.
const OUTPUT_SCHEMA = successSchema({
  time_range: { type: 'string', enum: [...TIME_RANGES] },
  results: {
    type: 'array',
    items: objectSchema({
      id: { type: 'string' },
      trending_score: { type: 'number' },
      post_tag_count: count,
      rss_item_tag_count: count,
    }),
  },
  page_info: componentSchema('PageInfo'),
})

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_trending_topics',
    type: 'function',
    description:
      'Get topics (cards, bank accounts, rewards programs, etc.) that are trending based on recent post and news activity. Useful for answering "what credit cards are popular right now?" or "what topics are being discussed?". Returns topic IDs with trending scores — use get_topic_details to get full card information. Returns page_info.end_cursor; pass it as after to get the next page.',
    parameters: {
      type: 'object',
      properties: {
        time_range: {
          type: 'string',
          enum: [...TIME_RANGES],
          description: 'Time window for trending calculation. Defaults to "week".',
        },
        after: {
          type: 'string',
          description: 'Cursor from a previous result page_info.end_cursor, for the next page.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          description:
            'Maximum number of results to return. Defaults to 20; values over 100 are clamped to 100.',
        },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get Trending Topics',
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/trending-topics' }],
    outputSchema: OUTPUT_SCHEMA,
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const timeRange = args.time_range ?? 'week'
      const pagination = trendingTopicsPaginationParser.parse({
        ...(args.after !== undefined && { after: args.after }),
        ...(args.limit !== undefined && { limit: args.limit }),
      })

      const { results, page_info } = await getTrendingTopics({ ...pagination, timeRange })

      return { success: true, time_range: timeRange, results, page_info }
    },
}

export default tool
