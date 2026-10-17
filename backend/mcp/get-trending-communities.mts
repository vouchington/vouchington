import type { MergedToolSource } from './create-merged-tool.mts'
import { getTrendingCommunities } from '@services/trending-communities'
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

type TrendingCommunityEntry = {
  id: string
  trending_score: number
  member_count: number
  post_count: number
  virtual_subscription_count: number
}

type ToolResult = McpPage<TrendingCommunityEntry> | InvalidCursorResult

const { default: defaultLimit, max } = TRENDING_PAGE_LIMIT

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'List public communities with the most activity over the last 30 days, as a signed-out reader sees them. Private communities never appear. Results contain an id, trending score and counts; use read_community (option details) for the community.',
    parameters: {
      type: 'object',
      properties: pageInputProperties('Communities', TRENDING_PAGE_LIMIT),
      required: [],
    },
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Trending Communities',
    requiredScopes: { mcp: ['communities:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/trending-communities' }],
    outputSchema: foundOrNotFoundSchema(
      pageProperties(
        closedObject(
          pickProperties('TrendingCommunity', [
            'id',
            'trending_score',
            'member_count',
            'post_count',
            'virtual_subscription_count',
          ]),
        ),
      ),
    ),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const page = await findPageOrNull(args.after, () =>
        getTrendingCommunities({
          limit: clampToolLimit(args.limit, defaultLimit, max),
          after: args.after,
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      return { success: true, results: page.communities, page_info: page.page_info }
    },
}

export default tool
