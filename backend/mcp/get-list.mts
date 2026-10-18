import type { MergedToolSource } from './create-merged-tool.mts'
import type { ToolInvocationContext } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { loadReadableList } from './list-read-access.mts'
import { LIST_NOT_FOUND, mcpListSchema, toMcpLists, type McpList } from './mcp-list-output.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

type ToolArgs = {
  list_id: string
}

type ToolResult = { success: true; list: McpList } | typeof LIST_NOT_FOUND

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'Get a list by UUID, including name, owner and visibility. Anyone with the id can read public or unlisted lists. Private lists require ownership and post-relations.owned-private:write consent; mcp.user:write alone does not grant it. Unknown, removed and inaccessible lists return List not found. Use read_my_lists (option items) for contents.',
    parameters: {
      type: 'object',
      properties: {
        list_id: { type: 'string', format: 'uuid' },
      },
      required: ['list_id'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get List',
    requiredScopes: ['lists:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/lists/:id' }],
    outputSchema: foundOrNotFoundSchema({ list: mcpListSchema() }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs, invocationContext?: ToolInvocationContext): Promise<ToolResult> => {
      const list = await loadReadableList(currentUser, args.list_id, invocationContext)
      if (!list) return LIST_NOT_FOUND
      // The list came from the primary, so its provenance does too.
      const [mcpList] = await toMcpLists([list], { readOnly: false })
      return { success: true, list: mcpList! }
    },
}

export default tool
