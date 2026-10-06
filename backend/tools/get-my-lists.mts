import { searchUserLists } from '@services/lists'
import type { Tool, ToolInvocationContext } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { hasOwnedPrivateGrant } from './list-read-access.mts'
import { LIST_PAGE_LIMIT, mcpListSchema, toMcpLists, type McpList } from './mcp-list-output.mts'
import { pageInputProperties, pageProperties, type McpPage } from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT, type InvalidCursorResult } from './paged-search.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  limit?: number
  after?: string
}

type ToolResult = McpPage<McpList> | InvalidCursorResult

const { default: defaultLimit, max } = LIST_PAGE_LIMIT

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_my_lists',
    type: 'function',
    description: `List the current user's own lists, newest first: each one's name, description and visibility. Public and unlisted lists are always included. Private lists are included only when the credential holds the post-relations.owned-private:write private-data consent scope (the mcp.user:write scope does not include it); without it they are left out as if they did not exist. Returns at most ${max} lists per page and page_info.end_cursor; pass it as after to get the next page. A malformed cursor returns { success: false, error: "Invalid cursor" }. Use get_list_items to read inside a list.`,
    parameters: {
      type: 'object',
      properties: pageInputProperties('Lists', LIST_PAGE_LIMIT),
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get My Lists',
    requiredScopes: { mcp: ['lists:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/lists' }],
    outputSchema: foundOrNotFoundSchema(pageProperties(mcpListSchema())),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs, invocationContext?: ToolInvocationContext): Promise<ToolResult> => {
      const page = await findPageOrNull(args.after, () =>
        searchUserLists(currentUser.id, {
          limit: clampToolLimit(args.limit, defaultLimit, max),
          after: args.after,
          includePrivate: hasOwnedPrivateGrant(currentUser, invocationContext),
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      return {
        success: true,
        results: await toMcpLists(page.results),
        page_info: page.page_info,
      }
    },
}

export default tool
