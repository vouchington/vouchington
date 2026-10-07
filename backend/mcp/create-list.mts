import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { attachWrittenListProvenance } from '@services/content-provenance'
import { createOwnedList, type List } from '@services/lists'
import type { BasicUser } from '@services/users/types'
import {
  LIST_FIELD_PARAMETERS,
  LIST_RESULT_SCHEMA,
  type ListToolFields,
} from './list-tool-support.mts'
import { requireActiveToolUser } from './private-user.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type CreateListArgs = ListToolFields & { name: string }

const tool: Tool<CreateListArgs, { success: true; list: List }> = {
  schema: {
    name: 'create_list',
    type: 'function',
    description:
      'Create a new list owned by the current user. Lists are private with no description unless set otherwise. Every call creates a new list, even when the name is already taken.',
    parameters: {
      type: 'object',
      properties: LIST_FIELD_PARAMETERS,
      required: ['name'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Create List',
    plan: 'plus',
    requiredScopes: { mcp: ['lists:read', 'lists:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [{ method: 'POST', path: '/api/v1/lists' }],
    outputSchema: LIST_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: CreateListArgs) => {
    const currentPrivateUser = await requireActiveToolUser(currentUser)
    const list = await createOwnedList(currentPrivateUser.id, getRequestContentProvenance(), args)
    return { success: true, list: await attachWrittenListProvenance(list, null) }
  },
}

export default tool
