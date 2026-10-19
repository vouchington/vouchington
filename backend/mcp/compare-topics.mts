import type { MergedToolSource } from './create-merged-tool.mts'
import type { BasicUser } from '@services/users/types'
import {
  getTopicDataPointInsightsBatch,
  type TopicDataPointInsights,
} from '@services/data-points/insights'
import { DATA_POINT_VERTICALS } from '@ts-shared/data-points'
import { resolveTopics } from './resolve-topic.mts'
import { topicReferenceSchema } from './entity-reference-schema.mts'
import { objectSchema, outcomeSchema } from './output-schema-shapes.mts'
import { INSIGHTS_PROPERTIES } from './topic-output-schema-parts.mts'

const VERTICALS = DATA_POINT_VERTICALS.map(o => o.value)

// The REST twin streams an untyped body, so the tool owns this schema.
const comparison = objectSchema({
  topic_id: { type: 'string' },
  topic_name: { type: 'string' },
  ...INSIGHTS_PROPERTIES,
})

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

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'Compare data point statistics side-by-side for two topics (cards, bank accounts, etc.). Useful for answering questions like "which card has a better approval rate?"',
    parameters: {
      type: 'object',
      properties: {
        topic_id_a: topicReferenceSchema,
        topic_id_b: topicReferenceSchema,
        vertical: {
          type: 'string',
          enum: VERTICALS,
        },
      },
      required: ['topic_id_a', 'topic_id_b'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Compare Topics',
    requiredScopes: ['topics:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics/compare' }],
    outputSchema: outcomeSchema('success', { topic_a: comparison, topic_b: comparison }),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const [topicA, topicB] = await resolveTopics([args.topic_id_a, args.topic_id_b])
      if (!topicA || !topicB) {
        return { success: false, error: 'Topic not found' }
      }

      const options = { vertical: args.vertical }
      const insights = await getTopicDataPointInsightsBatch([topicA.id, topicB.id], options)
      const insightsA = insights.get(topicA.id)
      const insightsB = insights.get(topicB.id)
      if (!insightsA || !insightsB) return { success: false, error: 'Topic not found' }

      return {
        success: true,
        topic_a: { topic_id: topicA.id, topic_name: topicA.name, ...insightsA },
        topic_b: { topic_id: topicB.id, topic_name: topicB.name, ...insightsB },
      }
    },
}

export default tool
