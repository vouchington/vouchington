import type { MergedToolSource } from './create-merged-tool.mts'
import type { BasicUser } from '@services/users/types'
import { getPostIds } from '@services/posts/search/get-ids'
import { sanitizePromptInjection } from '@jongleberry/vurst-prompt'
import {
  DATA_POINT_VERTICALS,
  CREDIT_SCORE_RANGES,
  CREDIT_CARD_RESULTS,
} from '@ts-shared/data-points'
import { resolveTopic } from './resolve-topic.mts'
import { topicReferenceSchema } from './entity-reference-schema.mts'
import { nullable, objectSchema, outcomeSchema } from '@vouchington/mcp-server/schema'
import { componentSchema } from './route-response-schema.mts'
import {
  findPageOrNull,
  INVALID_CURSOR_RESULT,
  type InvalidCursorResult,
  type SearchPageInfo,
} from './paged-search.mts'

const VERTICALS = DATA_POINT_VERTICALS.map(o => o.value)
const SCORE_RANGES = CREDIT_SCORE_RANGES.map(o => o.value)
const RESULTS = CREDIT_CARD_RESULTS.map(o => o.value)

type ToolArgs = {
  topic_id?: string
  vertical?: string
  result?: string
  credit_score_range?: string
  limit?: number
  after?: string
}

type ToolResult =
  | {
      success: true
      results: Array<{
        id: string
        title: string
        data_point_vertical: string | null
        structured_data: Record<string, unknown>
      }>
      page_info: SearchPageInfo
    }
  | InvalidCursorResult
  | {
      success: false
      error: string
    }

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'Search for data point posts from the last 30 days with optional JSONB filters. has_next_page covers only matches within that window. Use this to find approval rates, credit limits, and application outcomes for a specific card or topic.',
    parameters: {
      type: 'object',
      properties: {
        topic_id: topicReferenceSchema,
        vertical: {
          type: 'string',
          enum: VERTICALS,
        },
        result: {
          type: 'string',
          enum: RESULTS,
        },
        credit_score_range: {
          type: 'string',
          enum: SCORE_RANGES,
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 25, max: 25)',
        },
        after: {
          type: 'string',
          description:
            'Opaque cursor. Pass page_info.end_cursor from the previous response with the same filters while has_next_page is true. Stop when has_next_page is false. has_next_page covers only matches within the last 30 days.',
        },
      },
      required: [],
    },
  },
  meta: {
    audience: 'user',
    title: 'Search Data Points',
    requiredScopes: ['data-points:read'],
    annotations: { readOnlyHint: true },
    api: null,
    // `structured_data` is stored JSON whose fields vary by vertical, so it stays an open object.
    outputSchema: outcomeSchema('success', {
      results: {
        type: 'array',
        items: objectSchema({
          id: { type: 'string' },
          title: { type: 'string' },
          data_point_vertical: nullable({ type: 'string', enum: VERTICALS }),
          structured_data: { type: 'object' },
        }),
      },
      page_info: componentSchema('PageInfo'),
    }),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const topic = args.topic_id === undefined ? undefined : await resolveTopic(args.topic_id)
      if (topic === null) {
        return { success: false, error: 'Topic not found' }
      }

      const requestedLimit = args.limit ?? 25
      const limit = Math.min(Math.max(requestedLimit, 1), 25)
      const page = await findPageOrNull(args.after, () =>
        getPostIds(undefined, {
          post_types: ['data_point'],
          sort: 'new',
          data_point_topic_ids: topic === undefined ? undefined : [topic.id],
          data_point_vertical: args.vertical,
          data_point_result: args.result,
          data_point_credit_score_range: args.credit_score_range,
          hydrateDataPointPage: true,
          limit,
          after: args.after,
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT

      const sanitizedResults = await Promise.all(
        page.results.map(result => {
          if (result.title === undefined) {
            throw new Error(`Data-point search row ${result.id} was not hydrated`)
          }
          const structuredData =
            result.structured_data &&
            typeof result.structured_data === 'object' &&
            !Array.isArray(result.structured_data)
              ? (result.structured_data as Record<string, unknown>)
              : {}
          return sanitizePromptInjection(result.title, { isTitle: true }).then(title => ({
            id: result.id,
            title,
            data_point_vertical: result.data_point_vertical ?? null,
            structured_data: structuredData,
          }))
        }),
      )

      return {
        success: true,
        results: sanitizedResults,
        page_info: page.page_info,
      }
    },
}

export default tool
