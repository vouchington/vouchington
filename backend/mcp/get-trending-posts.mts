import { getPaginationLimitsForContract } from '@services/pagination'
import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { getTrendingPosts, trendingPostsPaginationParser } from '@services/trending-posts'
import type { TrendingPostsResult } from '@services/trending-posts/types'
import { resolveTopic } from './resolve-topic.mts'
import { outcomeSchema, objectSchema } from './output-schema-shapes.mts'
import { componentSchema } from './route-response-schema.mts'
import {
  VALID_TRENDING_POST_TYPES,
  VALID_TRENDING_TIME_RANGES,
  type TrendingPostType,
  type TrendingTimeRange,
} from '@ts-shared/feed-capabilities'

type ToolArgs = {
  time_range?: TrendingTimeRange
  post_type?: TrendingPostType
  topic_id?: string
  after?: string
  limit?: number
}

type ToolResult =
  | ({ success: true; time_range: string } & TrendingPostsResult)
  | { success: false; error: string }

// The REST twin documents no response body, so the tool owns this schema. `page_info` is the
// generated PageInfo component, the same one the posts route documents.
const OUTPUT_SCHEMA = outcomeSchema('success', {
  time_range: { type: 'string', enum: [...VALID_TRENDING_TIME_RANGES] },
  results: {
    type: 'array',
    items: objectSchema({ id: { type: 'string' }, trending_score: { type: 'number' } }),
  },
  page_info: componentSchema('PageInfo'),
})

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_trending_posts',
    type: 'function',
    description:
      'Get posts that are trending based on time-decay voting. Useful for "what discussions are hot this week?" or "what are the most popular reviews for this card?". Optionally filter by post type or topic. Returns page_info.end_cursor; pass it as after to get the next page.',
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
          description: 'Optionally filter to posts tagged with a specific topic, by UUID or slug.',
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
    surfaces: ['internal', 'mcp'],
    title: 'Get Trending Posts',
    requiredScopes: { mcp: ['posts:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/trending-posts' }],
    outputSchema: OUTPUT_SCHEMA,
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const topic = args.topic_id === undefined ? undefined : await resolveTopic(args.topic_id)
      if (topic === null) {
        return { success: false, error: 'Topic not found' }
      }

      const timeRange = args.time_range ?? 'week'
      const pagination = trendingPostsPaginationParser.parse(
        {
          ...(args.after !== undefined && { after: args.after }),
          ...(args.limit !== undefined && { limit: args.limit }),
        },
        getPaginationLimitsForContract(trendingPostsPaginationParser.queryContract),
      )

      const { results, page_info } = await getTrendingPosts({
        ...pagination,
        timeRange,
        postType: args.post_type,
        topicId: topic?.id,
      })

      return { success: true, time_range: timeRange, results, page_info }
    },
}

export default tool
