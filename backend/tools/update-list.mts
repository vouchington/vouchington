import { updateOwnedList, type List } from '@services/lists'
import type { BasicUser } from '@services/users/types'
import {
  getListWriteContext,
  LIST_FIELD_PARAMETERS,
  LIST_ID_PARAMETER,
  LIST_RESULT_SCHEMA,
  type ListToolFields,
} from './list-tool-support.mts'
import type { Tool } from './types.mts'

type UpdateListArgs = ListToolFields & { list_id: string }

const tool: Tool<UpdateListArgs, { success: true; list: List }> = {
  schema: {
    name: 'update_list',
    type: 'function',
    description:
      "Change the name, description, or visibility of a list the current user owns. Only the fields sent change; send a null description to clear it. Another user's list cannot be changed.",
    parameters: {
      type: 'object',
      properties: { list_id: LIST_ID_PARAMETER, ...LIST_FIELD_PARAMETERS },
      required: ['list_id'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Update List',
    plan: 'plus',
    requiredScopes: { mcp: ['lists:read', 'lists:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    api: [{ method: 'PATCH', path: '/api/v1/lists/:id' }],
    outputSchema: LIST_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: UpdateListArgs) => {
    const { list_id, ...fields } = args
    const { user, list } = await getListWriteContext(currentUser, list_id)
    return { success: true, list: await updateOwnedList(user.id, list, fields) }
  },
}

export default tool
