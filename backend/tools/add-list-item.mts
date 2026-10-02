import { assertPostTargetAccess } from '@services/entity-relation-actions'
import { addListItem, type ListItem } from '@services/lists'
import type { BasicUser } from '@services/users/types'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import {
  getListWriteContext,
  LIST_ITEM_PARAMETERS,
  LIST_ITEM_RESULT_SCHEMA,
  type ListItemToolArgs,
} from './list-tool-support.mts'
import type { Tool, ToolInvocationContext } from '@services/openai-agents/tool-types'

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
    surfaces: ['mcp'],
    title: 'Add List Item',
    plan: 'plus',
    requiredScopes: { mcp: ['lists:read', 'lists:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [
      { method: 'POST', path: '/api/v1/lists/:id/items/posts' },
      { method: 'POST', path: '/api/v1/lists/:id/items/rss-feed-items' },
    ],
    outputSchema: LIST_ITEM_RESULT_SCHEMA,
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ListItemToolArgs, invocationContext?: ToolInvocationContext) => {
      const { user, list } = await getListWriteContext(currentUser, args.list_id)
      const authority = getDelegatedToolAuthority(user, invocationContext)
      // A credential reaches a post only through the same visibility and private-post rules a
      // relation to it would need, so a list cannot become a way around them.
      if (args.item_type === 'post') {
        await assertPostTargetAccess(user, authority, args.entity_id)
      }
      return {
        success: true,
        list_item: await addListItem(list.id, args.item_type, args.entity_id),
      }
    },
}

export default tool
