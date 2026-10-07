import type { Tool, ToolInvocationContext } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { loadReadableList } from './list-read-access.mts'
import { LIST_NOT_FOUND, mcpListSchema, toMcpLists, type McpList } from './mcp-list-output.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

type ToolArgs = {
  list_id: string
}

type ToolResult = { success: true; list: McpList } | typeof LIST_NOT_FOUND

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_list',
    type: 'function',
    description:
      'Get one list by its UUID: its name, description, owner and visibility. Public and unlisted lists are readable by anyone who has the id. A private list is readable only by its owner, and only when the credential holds the post-relations.owned-private:write private-data consent scope (the mcp.user:write scope does not include it). Every other case, including an unknown, removed or another user\'s private list, returns the same { success: false, error: "List not found" }. Use get_list_items to read inside a list.',
    parameters: {
      type: 'object',
      properties: {
        list_id: { type: 'string', format: 'uuid', description: 'The ID of the list.' },
      },
      required: ['list_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get List',
    requiredScopes: { mcp: ['lists:read'] },
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
