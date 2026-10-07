import { softDeleteList } from '@services/lists'
import type { BasicUser } from '@services/users/types'
import {
  getListWriteContext,
  LIST_ID_PARAMETER,
  SUCCESS_RESULT_SCHEMA,
} from './list-tool-support.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type DeleteListArgs = { list_id: string }

const tool: Tool<DeleteListArgs, { success: true }> = {
  schema: {
    name: 'delete_list',
    type: 'function',
    description:
      "Delete a list the current user owns, along with its items. Deleting a list that is already deleted fails as not found, and another user's list cannot be deleted.",
    parameters: {
      type: 'object',
      properties: { list_id: LIST_ID_PARAMETER },
      required: ['list_id'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Delete List',
    plan: 'plus',
    requiredScopes: { mcp: ['lists:read', 'lists:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'DELETE', path: '/api/v1/lists/:id' }],
    outputSchema: SUCCESS_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: DeleteListArgs) => {
    const { user, list } = await getListWriteContext(currentUser, args.list_id)
    await softDeleteList(user.id, list.id)
    return { success: true }
  },
}

export default tool
