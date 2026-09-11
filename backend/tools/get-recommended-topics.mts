import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { getRecommendedTopics } from '@services/recommended-topics/get-recommendations'
import { clampToolLimit } from './search-system.mts'
import { requirePrivateToolUser } from './private-user.mts'

const MAX_LIMIT = 25
const DEFAULT_LIMIT = 10

type ToolArgs = {
  limit?: number
}

type RecommendedTopicEntry = {
  id: string
  score: number
  reason: string
}

type ToolResult = {
  success: true
  results: RecommendedTopicEntry[]
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_recommended_topics',
    type: 'function',
    description:
      "Get personalized topic recommendations based on the current user's activity, including positive post choices, followed feeds, and views. Use this for questions like 'what cards should I look into?' or 'what topics might interest me?'. Returns topic IDs with recommendation scores. Use get_topic_details for full card information.",
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: `Maximum number of recommendations to return (1-${MAX_LIMIT}). Defaults to ${DEFAULT_LIMIT}.`,
        },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/recommended-topics' }],
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const privateUser = await requirePrivateToolUser(currentUser)
      const limit = clampToolLimit(args.limit, DEFAULT_LIMIT, MAX_LIMIT)

      const { results } = await getRecommendedTopics(privateUser, { limit })

      return {
        success: true,
        results: results.map(r => ({ id: r.id, score: r.score, reason: r.reason })),
      }
    },
}

export default tool
