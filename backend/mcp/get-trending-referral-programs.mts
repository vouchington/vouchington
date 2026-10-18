import type { MergedToolSource } from './create-merged-tool.mts'
import { getTrendingReferralPrograms } from '@services/trending-referral-programs'
import type { BasicUser } from '@services/users/types'
import {
  pageInputProperties,
  pageProperties,
  TRENDING_PAGE_LIMIT,
  type McpPage,
} from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT, type InvalidCursorResult } from './paged-search.mts'
import { closedObject, foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  limit?: number
  after?: string
}

type TrendingReferralProgramEntry = {
  id: string
  trending_score: number
  link_count: number
}

type ToolResult = McpPage<TrendingReferralProgramEntry> | InvalidCursorResult

const { default: defaultLimit, max } = TRENDING_PAGE_LIMIT

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'List referral programs with the most new active links in the last 30 days. Results give topic ids, scores and link counts. Use read_topic (option details) for a program and get_referral_links for its links.',
    parameters: {
      type: 'object',
      properties: pageInputProperties('Referral programs', TRENDING_PAGE_LIMIT),
      required: [],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get Trending Referral Programs',
    requiredScopes: ['topics:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/trending-referral-programs' }],
    outputSchema: foundOrNotFoundSchema(
      pageProperties(
        closedObject(
          pickProperties('TrendingReferralProgram', ['id', 'trending_score', 'link_count']),
        ),
      ),
    ),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const page = await findPageOrNull(args.after, () =>
        getTrendingReferralPrograms({
          limit: clampToolLimit(args.limit, defaultLimit, max),
          after: args.after,
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      return { success: true, results: page.referral_programs, page_info: page.page_info }
    },
}

export default tool
