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
    description: `List the public communities with the most recent activity, as a signed-out reader sees them: a private community never appears, whoever asks. Each result is a community id with its trending score and counts; use read_community (option details) for the community itself. "Trending" is the last 30 days of reviewed posts, members and follows. Returns at most ${max} communities per page and page_info.end_cursor; pass it as after to get the next page.`,
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
