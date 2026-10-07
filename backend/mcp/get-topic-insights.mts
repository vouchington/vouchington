import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { getTopicDataPointInsights } from '@services/data-points/insights'
import { DATA_POINT_VERTICALS } from '@ts-shared/data-points'
import type { Money } from '@ts-shared/money'
import { resolveTopic } from './resolve-topic.mts'
import { outcomeSchema } from './output-schema-shapes.mts'
import { INSIGHTS_PROPERTIES } from './topic-output-schema-parts.mts'

const VERTICALS = DATA_POINT_VERTICALS.map(o => o.value)

type ToolArgs = {
  topic_id: string
  vertical?: string
}

type ToolResult =
  | {
      success: true
      topic_id: string
      total_count: number
      approved_count: number
      denied_count: number
      pending_count: number
      approval_rate: number | null
      median_credit_limits: Money[]
      credit_score_distribution: Record<string, number>
    }
  | {
      success: false
      error: string
    }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_topic_insights',
    type: 'function',
    description:
      'Get aggregate data point statistics for a topic (card, bank account, etc.). Returns approval rate, median credit limit, and credit score distribution.',
    parameters: {
      type: 'object',
      properties: {
        topic_id: {
          type: 'string',
          description: 'The topic UUID or slug to aggregate data points for',
        },
        vertical: {
          type: 'string',
          enum: VERTICALS,
          description: 'Optionally filter to a specific data point vertical',
        },
      },
      required: ['topic_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Topic Insights',
    requiredScopes: { mcp: ['data-points:read'] },
    annotations: { readOnlyHint: true },
    api: null,
    outputSchema: outcomeSchema('success', {
      topic_id: { type: 'string' },
      ...INSIGHTS_PROPERTIES,
    }),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const topic = await resolveTopic(args.topic_id)
      if (!topic) {
        return { success: false, error: 'Topic not found' }
      }

      const insights = await getTopicDataPointInsights(topic.id, {
        vertical: args.vertical,
      })

      return {
        success: true,
        topic_id: topic.id,
        ...insights,
      }
    },
}

export default tool
