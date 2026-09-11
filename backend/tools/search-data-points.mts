import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { searchDataPoints } from '@services/data-points/search'
import { sanitizePromptInjection } from '@jongleberry/vurst-prompt'
import {
  DATA_POINT_VERTICALS,
  CREDIT_SCORE_RANGES,
  CREDIT_CARD_RESULTS,
} from '@ts-shared/data-points'

const VERTICALS = DATA_POINT_VERTICALS.map(o => o.value)
const SCORE_RANGES = CREDIT_SCORE_RANGES.map(o => o.value)
const RESULTS = CREDIT_CARD_RESULTS.map(o => o.value)

type ToolArgs = {
  topic_id?: string
  vertical?: string
  result?: string
  credit_score_range?: string
  limit?: number
}

type ToolResult = {
  success: true
  results: Array<{
    id: string
    title: string
    data_point_vertical: string | null
    structured_data: Record<string, unknown>
  }>
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'search_data_points',
    type: 'function',
    description:
      'Search for data point posts with optional JSONB filters. Use this to find approval rates, credit limits, and application outcomes for a specific card or topic.',
    parameters: {
      type: 'object',
      properties: {
        topic_id: {
          type: 'string',
          description: 'Filter by topic UUID (e.g. a specific credit card or bank account topic)',
        },
        vertical: {
          type: 'string',
          enum: VERTICALS,
          description: 'Filter by data point vertical',
        },
        result: {
          type: 'string',
          enum: RESULTS,
          description: 'Filter by application result',
        },
        credit_score_range: {
          type: 'string',
          enum: SCORE_RANGES,
          description: 'Filter by applicant credit score range',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 25, max: 25)',
        },
      },
      required: [],
    },
    strict: null,
  },
  meta: { surfaces: ['internal', 'mcp'], annotations: { readOnlyHint: true }, api: null },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const results = await searchDataPoints({
        topic_id: args.topic_id,
        vertical: args.vertical,
        result: args.result,
        credit_score_range: args.credit_score_range,
        limit: args.limit,
      })

      const sanitizedResults = await Promise.all(
        results.map(async result => ({
          ...result,
          title: await sanitizePromptInjection(result.title, { isTitle: true }),
        })),
      )

      return {
        success: true,
        results: sanitizedResults,
      }
    },
}

export default tool
