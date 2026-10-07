import { isUUID } from '@modules/utils'
import { getListsContainingEntity } from '@services/lists'
import type { Tool, ToolInvocationContext } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { hasOwnedPrivateGrant } from './list-read-access.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

const ITEM_TYPES = ['post', 'rss_feed_item'] as const

type ToolArgs = { item_type: (typeof ITEM_TYPES)[number]; entity_id: string }

type ToolResult =
  | { success: true; list_ids: string[] }
  | { success: false; error: 'Invalid entity_id' }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_my_lists_containing',
    type: 'function',
    description:
      "Find which of the current user's own lists hold a post or an RSS feed item, newest list first: the list_ids to read with get_list. Only the credential owner's lists are searched, never another user's. Public and unlisted lists are always searched. Private lists are searched only when the credential holds the post-relations.owned-private:write private-data consent scope (the mcp.user:write scope does not include it); without it they are left out as if they did not exist. A removed list never appears. An entity on no list returns an empty list_ids. An entity_id that is not a UUID returns { success: false, error: \"Invalid entity_id\" }.",
    parameters: {
      type: 'object',
      properties: {
        item_type: {
          type: 'string',
          enum: [...ITEM_TYPES],
          description: 'What entity_id is: a post or an RSS feed item',
        },
        entity_id: { type: 'string', format: 'uuid', description: 'The ID of the post or item' },
      },
      required: ['item_type', 'entity_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get My Lists Containing',
    requiredScopes: { mcp: ['lists:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/lists/contains' }],
    outputSchema: foundOrNotFoundSchema({
      list_ids: { type: 'array', items: { type: 'string' } },
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs, invocationContext?: ToolInvocationContext): Promise<ToolResult> => {
      if (!isUUID(args.entity_id)) return { success: false, error: 'Invalid entity_id' }
      return {
        success: true,
        list_ids: await getListsContainingEntity(currentUser.id, args.item_type, args.entity_id, {
          includePrivate: hasOwnedPrivateGrant(currentUser, invocationContext),
        }),
      }
    },
}

export default tool
