import {
  addListItem,
  assertListablePostId,
  assertListableRssFeedItemId,
  type ListItem,
} from '@services/lists'
import assert from 'http-assert'
import { entityRelationViewerFor } from '@services/users'
import type { BasicUser } from '@services/users/types'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { canonicalEntityId } from './resolve-entity-reference.mts'
import {
  getListWriteContext,
  LIST_ITEM_PARAMETERS,
  LIST_ITEM_RESULT_SCHEMA,
  type ListItemToolArgs,
} from './list-tool-support.mts'
import type {
  Tool,
  ToolApiEndpoint,
  ToolInvocationContext,
} from '@services/openai-agents/tool-types'
import { selectApiByArgument } from './select-api-by-argument.mts'

const ENDPOINTS: Record<string, ToolApiEndpoint> = {
  post: { method: 'POST', path: '/api/v1/lists/:id/items/posts' },
  rss_feed_item: { method: 'POST', path: '/api/v1/lists/:id/items/rss-feed-items' },
}

const tool: Tool<ListItemToolArgs, { success: true; list_item: ListItem }> = {
  schema: {
    name: 'add_list_item',
    type: 'function',
    description:
      "Add a post or an RSS feed item to a list the current user owns. Adding an item that is already on the list returns the existing entry. A post is only available if the user can see it; the user's own private posts additionally need the private-post consent scope.",
    parameters: LIST_ITEM_PARAMETERS,
    strict: null,
  },
  meta: {
    audience: 'user',
    title: 'Add List Item',
    plan: 'plus',
    requiredScopes: ['lists:read', 'lists:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: Object.values(ENDPOINTS),
    selectApi: selectApiByArgument('item_type', ENDPOINTS),
    outputSchema: LIST_ITEM_RESULT_SCHEMA,
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ListItemToolArgs, invocationContext?: ToolInvocationContext) => {
      const { user, list } = await getListWriteContext(currentUser, args.list_id)
      const authority = getDelegatedToolAuthority(user, invocationContext)
      const entityType = args.item_type === 'post' ? 'post' : 'rss_feed_item'
      const entityId = await canonicalEntityId(entityType, args.entity_id)
      assert(entityId, 404, 'Not found')
      if (args.item_type === 'post') {
        await assertListablePostId(entityRelationViewerFor(user), authority, entityId)
      } else {
        await assertListableRssFeedItemId(entityId)
      }
      return {
        success: true,
        list_item: await addListItem(list.id, args.item_type, entityId),
      }
    },
}

export default tool
