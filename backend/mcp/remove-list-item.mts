import type { MergedToolSource } from './create-merged-tool.mts'
import { removeListItem } from '@services/lists'
import assert from 'http-assert'
import type { BasicUser } from '@services/users/types'
import {
  getListWriteContext,
  LIST_ITEM_PARAMETERS,
  SUCCESS_RESULT_SCHEMA,
  type ListItemToolArgs,
} from './list-tool-support.mts'
import type { ToolApiEndpoint } from '@services/openai-agents/tool-types'
import { selectApiByArgument } from '@vouchington/mcp-server/tools'
import { canonicalEntityId } from './resolve-entity-reference.mts'

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
    audience: 'user',
    title: 'Remove List Item',
    plan: 'plus',
    requiredScopes: ['lists:read', 'lists:write'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: Object.values(ENDPOINTS),
    selectApi: selectApiByArgument('item_type', ENDPOINTS),
    outputSchema: SUCCESS_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: ListItemToolArgs) => {
    const { list } = await getListWriteContext(currentUser, args.list_id)
    const entityType = args.item_type === 'post' ? 'post' : 'rss_feed_item'
    const entityId = await canonicalEntityId(entityType, args.entity_id)
    assert(entityId, 404, 'List item not found')
    await removeListItem(list.id, args.item_type, entityId)
    return { success: true }
  },
}

export default tool
