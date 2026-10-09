import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { getRecommendedTopics } from '@services/recommended-topics/get-recommendations'
import { clampToolLimit } from './search-system.mts'
import { VALID_TOPIC_TYPES } from '@modules/pagination/filters'
import { pageInfoSchema } from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT, type SearchPageInfo } from './paged-search.mts'
import { requirePrivateToolUser } from './private-user.mts'
import { objectSchema, outcomeSchema } from './output-schema-shapes.mts'

const MAX_LIMIT = 25
const DEFAULT_LIMIT = 10

type ToolArgs = {
  limit?: number
  after?: string
  rss_feed?: boolean
  sort?: 'score' | 'best'
  spending_category?: boolean
  topic_types?: Array<(typeof VALID_TOPIC_TYPES)[number]>
}

type RecommendedTopicEntry = {
  id: string
  score: number
  reason: string
}

type ToolResult =
  | {
      success: true
      results: RecommendedTopicEntry[]
      page_info: SearchPageInfo
    }
  | typeof INVALID_CURSOR_RESULT

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_recommended_topics',
    type: 'function',
    description:
      "Get personalized topic recommendations based on the current user's activity, including positive post choices, followed feeds, and views. Use this for questions like 'what cards should I look into?' or 'what topics might interest me?'. Returns topic IDs with recommendation scores. Use read_topic (option details) for full card information.",
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: `Maximum number of recommendations to return (1-${MAX_LIMIT}). Defaults to ${DEFAULT_LIMIT}.`,
        },
        after: { type: 'string' },
        rss_feed: { type: 'boolean' },
        sort: { type: 'string', enum: ['score', 'best'] },
        spending_category: { type: 'boolean' },
        topic_types: { type: 'array', items: { type: 'string', enum: [...VALID_TOPIC_TYPES] } },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Recommended Topics',
    requiredScopes: { mcp: ['recommendations:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/recommended-topics' }],
    // The REST twin streams an untyped body and returns more per entry, so the tool owns this.
    outputSchema: outcomeSchema('success', {
      results: {
        type: 'array',
        items: objectSchema({
          id: { type: 'string' },
          score: { type: 'number' },
          reason: { type: 'string' },
        }),
      },
      page_info: pageInfoSchema(),
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const privateUser = await requirePrivateToolUser(currentUser)
      const limit = clampToolLimit(args.limit, DEFAULT_LIMIT, MAX_LIMIT)

      const page = await findPageOrNull(args.after, () =>
        getRecommendedTopics(privateUser, {
          limit,
          after: args.after,
          rss_feed: args.rss_feed,
          sort: args.sort,
          spending_category: args.spending_category,
          topic_types: args.topic_types,
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      const { results, page_info } = page

      return {
        success: true,
        results: results.map(r => ({ id: r.id, score: r.score, reason: r.reason })),
        page_info,
      }
    },
}

export default tool
