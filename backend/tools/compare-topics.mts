import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import {
  getTopicDataPointInsights,
  type TopicDataPointInsights,
} from '@services/data-points/insights'
import { DATA_POINT_VERTICALS } from '@ts-shared/data-points'
import { resolveTopic } from './resolve-topic.mts'

const VERTICALS = DATA_POINT_VERTICALS.map(o => o.value)

type ToolArgs = {
  topic_id_a: string
  topic_id_b: string
  vertical?: string
}

type TopicComparison = TopicDataPointInsights & {
  topic_id: string
  topic_name: string
}

type ToolResult =
  | {
      success: true
      topic_a: TopicComparison
      topic_b: TopicComparison
    }
  | {
      success: false
      error: string
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
          description: 'UUID or slug of the first topic to compare',
        },
        topic_id_b: {
          type: 'string',
          description: 'UUID or slug of the second topic to compare',
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
      const [topicA, topicB] = await Promise.all([
        resolveTopic(args.topic_id_a),
        resolveTopic(args.topic_id_b),
      ])
      if (!topicA || !topicB) {
        return { success: false, error: 'Topic not found' }
      }

      const options = { vertical: args.vertical }
      const [insightsA, insightsB] = await Promise.all([
        getTopicDataPointInsights(topicA.id, options),
        getTopicDataPointInsights(topicB.id, options),
      ])

      return {
        success: true,
        topic_a: { topic_id: topicA.id, topic_name: topicA.name, ...insightsA },
        topic_b: { topic_id: topicB.id, topic_name: topicB.name, ...insightsB },
      }
    },
}

export default tool
