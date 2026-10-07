import { buildPageInfo, decodeScopedAliasCursor } from '@modules/pagination'
import { searchUsers, usersSearchCursorScope } from '@services/users'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { pageInputProperties } from './mcp-read-output.mts'
import {
  toMcpUser,
  USER_PAGE_LIMIT,
  usersPageProperties,
  type McpUsersPage,
} from './mcp-user-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT, type InvalidCursorResult } from './paged-search.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  q: string
  limit?: number
  after?: string
}

type ToolResult = McpUsersPage | InvalidCursorResult

const { default: defaultLimit, max } = USER_PAGE_LIMIT

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'search_users',
    type: 'function',
    description: `Search users by the start of their username, case-insensitive, sorted A to Z. Results are public profiles only, as get_user returns them, and never an administrator's view. A blank query returns no results. Returns at most ${max} users per page and page_info.end_cursor; pass it as after, with the same q, to get the next page. A malformed cursor, or one from a different q, returns { success: false, error: "Invalid cursor" }.`,
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'The start of the username to find' },
        ...pageInputProperties('Users', USER_PAGE_LIMIT),
      },
      required: ['q'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Search Users',
    requiredScopes: { mcp: ['users:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/users' }],
    outputSchema: foundOrNotFoundSchema(usersPageProperties()),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      // The cursor is bound to this query and to the non-administrator view, like REST's.
      const scope = usersSearchCursorScope({ query: args.q, admin: false })
      const page = await findPageOrNull(args.after, async () => {
        const after = args.after
          ? decodeScopedAliasCursor(args.after, scope, 'Invalid cursor format').alias
          : undefined
        const { results, hasNextPage } = await searchUsers(args.q, {
          limit: clampToolLimit(args.limit, defaultLimit, max),
          after,
        })
        return {
          results,
          page_info: buildPageInfo(results, {
            hasNextPage,
            getCursor: user => ({ alias: user.username ? user.username.toLowerCase() : '', scope }),
          }),
        }
      })
      if (!page) return INVALID_CURSOR_RESULT
      return {
        success: true,
        results: await Promise.all(page.results.map(toMcpUser)),
        page_info: page.page_info,
      }
    },
}

export default tool
