import type { MergedToolSource } from './create-merged-tool.mts'
import { getListsContainingEntity } from '@services/lists'
import type { ToolInvocationContext } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { hasOwnedPrivateGrant } from './list-read-access.mts'
import { canonicalEntityId } from './resolve-entity-reference.mts'
import { postReferenceSchema } from './entity-reference-schema.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

const ITEM_TYPES = ['post', 'rss_feed_item'] as const

type ToolArgs = { item_type: (typeof ITEM_TYPES)[number]; entity_id: string }

type ToolResult = { success: true; list_ids: string[] }

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      "Find which of the current user's lists contain a post or RSS item; read their ids with read_my_lists (option get). Public and unlisted lists are included. Private lists require post-relations.owned-private:write consent; mcp.user:write alone does not grant it. Without consent they are hidden. Removed lists are omitted.",
    parameters: {
      type: 'object',
      properties: {
        item_type: {
          type: 'string',
          enum: [...ITEM_TYPES],
        },
        entity_id: {
          ...postReferenceSchema,
          description: 'Post id or slug, or RSS feed item id',
        },
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
      const entityType = args.item_type === 'post' ? 'post' : 'rss_feed_item'
      const entityId = await canonicalEntityId(entityType, args.entity_id)
      if (!entityId) return { success: true, list_ids: [] }
      return {
        success: true,
        list_ids: await getListsContainingEntity(currentUser.id, args.item_type, entityId, {
          includePrivate: hasOwnedPrivateGrant(currentUser, invocationContext),
        }),
      }
    },
}

export default tool
