import type { MergedToolSource } from './create-merged-tool.mts'
import { isUUID } from '@modules/utils'
import { getListsContainingEntity } from '@services/lists'
import type { ToolInvocationContext } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { hasOwnedPrivateGrant } from './list-read-access.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

const ITEM_TYPES = ['post', 'rss_feed_item'] as const

type ToolArgs = { item_type: (typeof ITEM_TYPES)[number]; entity_id: string }

type ToolResult =
  | { success: true; list_ids: string[] }
  | { success: false; error: 'Invalid entity_id' }

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      "Find which of the current user's lists contain a post or RSS item; read their ids with read_my_lists (option get). Public and unlisted lists are included. Private lists require post-relations.owned-private:write consent; mcp.user:write alone does not grant it. Without consent they are hidden. Removed lists are omitted; entity_id must be a UUID.",
    parameters: {
      type: 'object',
      properties: {
        item_type: {
          type: 'string',
          enum: [...ITEM_TYPES],
        },
        entity_id: { type: 'string', format: 'uuid' },
      },
      required: ['item_type', 'entity_id'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get My Lists Containing',
    requiredScopes: ['lists:read'],
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
