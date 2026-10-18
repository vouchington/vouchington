import type { MergedToolSource } from './create-merged-tool.mts'
import { searchUserLists } from '@services/lists'
import type { ToolInvocationContext } from '@services/openai-agents/tool-types'
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

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      "List the current user's lists, newest first. Public and unlisted lists are included. Private lists require post-relations.owned-private:write consent; mcp.user:write alone does not grant it. Without consent they are hidden. Use read_my_lists (option items) for contents.",
    parameters: {
      type: 'object',
      properties: pageInputProperties('Lists', LIST_PAGE_LIMIT),
      required: [],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get My Lists',
    requiredScopes: ['lists:read'],
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
