import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import {
  getTopicDataPointInsights,
  type TopicDataPointInsights,
} from '@services/data-points/insights'
import { getTopicByAnyCachedBatch } from '@services/entity-fetch'
import { DATA_POINT_VERTICALS } from '@ts-shared/data-points'

const VERTICALS = DATA_POINT_VERTICALS.map(o => o.value)

type ToolArgs = {
  topic_id_a: string
  topic_id_b: string
  vertical?: string
}

type TopicComparison = TopicDataPointInsights & {
  topic_id: string
  topic_name: string | null
}

type ToolResult = {
  success: true
  topic_a: TopicComparison
  topic_b: TopicComparison
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'compare_topics',
    type: 'function',
    description:
      'Compare data point statistics side-by-side for two topics (cards, bank accounts, etc.). Useful for answering questions like "which card has a better approval rate?"',
    parameters: {
      type: 'object',
      properties: {
        topic_id_a: {
          type: 'string',
          description: 'UUID of the first topic to compare',
        },
        topic_id_b: {
          type: 'string',
          description: 'UUID of the second topic to compare',
        },
        vertical: {
          type: 'string',
          enum: VERTICALS,
          description: 'Optionally filter to a specific data point vertical',
        },
      },
      required: ['topic_id_a', 'topic_id_b'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Compare Topics',
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics/compare' }],
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const options = { vertical: args.vertical }

      const [insightsA, insightsB, topics] = await Promise.all([
        getTopicDataPointInsights(args.topic_id_a, options),
        getTopicDataPointInsights(args.topic_id_b, options),
        getTopicByAnyCachedBatch([args.topic_id_a, args.topic_id_b]),
      ])

      const topicMap = new Map(topics.flatMap(t => (t != null ? [[t.id, t] as const] : [])))

      return {
        success: true,
        topic_a: {
          topic_id: args.topic_id_a,
          topic_name: topicMap.get(args.topic_id_a)?.name ?? null,
          ...insightsA,
        },
        topic_b: {
          topic_id: args.topic_id_b,
          topic_name: topicMap.get(args.topic_id_b)?.name ?? null,
          ...insightsB,
        },
      }
    },
}

export default tool
