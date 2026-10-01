import { removeListItem } from '@services/lists'
import type { BasicUser } from '@services/users/types'
import {
  getListWriteContext,
  LIST_ITEM_PARAMETERS,
  SUCCESS_RESULT_SCHEMA,
  type ListItemToolArgs,
} from './list-tool-support.mts'
import type { Tool } from './types.mts'

const tool: Tool<ListItemToolArgs, { success: true }> = {
  schema: {
    name: 'remove_list_item',
    type: 'function',
    description:
      "Remove a post or an RSS feed item from a list the current user owns. Removing an item that is not on the list fails as not found, and another user's list cannot be changed.",
    parameters: LIST_ITEM_PARAMETERS,
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Remove List Item',
    plan: 'plus',
    requiredScopes: { mcp: ['lists:read', 'lists:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [
      { method: 'DELETE', path: '/api/v1/lists/:id/items/posts/:entityId' },
      { method: 'DELETE', path: '/api/v1/lists/:id/items/rss-feed-items/:entityId' },
    ],
    outputSchema: SUCCESS_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: ListItemToolArgs) => {
    const { list } = await getListWriteContext(currentUser, args.list_id)
    await removeListItem(list.id, args.item_type, args.entity_id)
    return { success: true }
  },
}

export default tool
