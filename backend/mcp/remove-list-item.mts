import type { MergedToolSource } from './create-merged-tool.mts'
import { removeListItem } from '@services/lists'
import type { BasicUser } from '@services/users/types'
import {
  getListWriteContext,
  LIST_ITEM_PARAMETERS,
  SUCCESS_RESULT_SCHEMA,
  type ListItemToolArgs,
} from './list-tool-support.mts'
import type { ToolApiEndpoint } from '@services/openai-agents/tool-types'
import { selectApiByArgument } from './select-api-by-argument.mts'

const ENDPOINTS: Record<string, ToolApiEndpoint> = {
  post: { method: 'DELETE', path: '/api/v1/lists/:id/items/posts/:entityId' },
  rss_feed_item: { method: 'DELETE', path: '/api/v1/lists/:id/items/rss-feed-items/:entityId' },
}

const tool: MergedToolSource<ListItemToolArgs, { success: true }> = {
  schema: {
    description:
      "Remove a post or an RSS feed item from a list the current user owns. Removing an item that is not on the list fails as not found, and another user's list cannot be changed.",
    parameters: LIST_ITEM_PARAMETERS,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Remove List Item',
    plan: 'plus',
    requiredScopes: { mcp: ['lists:read', 'lists:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: Object.values(ENDPOINTS),
    selectApi: selectApiByArgument('item_type', ENDPOINTS),
    outputSchema: SUCCESS_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: ListItemToolArgs) => {
    const { list } = await getListWriteContext(currentUser, args.list_id)
    await removeListItem(list.id, args.item_type, args.entity_id)
    return { success: true }
  },
}

export default tool
