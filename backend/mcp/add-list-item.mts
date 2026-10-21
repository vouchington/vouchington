import { importCommunityList } from '@services/lists'
import { loadCommunityForViewer } from '@services/communities'
import { entityRelationViewerFor } from '@services/users'
import type { BasicUser } from '@services/users/types'
import { communityReferenceSchema } from './entity-reference-schema.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { getListWriteContext, LIST_ID_PARAMETER } from './list-tool-support.mts'
import { oneOfSchema, successSchema } from './output-schema-shapes.mts'
import { entityIdOrMissing } from './resolve-entity-reference.mts'
import {
  ADD_LIST_ITEM_LIMIT,
  addVisibleListItems,
  type AddedListItem,
  type ListItemRef,
} from './add-list-items.mts'
import type { Tool, ToolInvocationContext } from '@services/openai-agents/tool-types'

const IMPORT = { method: 'POST' as const, path: '/api/v1/lists/:id/import' }
const POSTS = { method: 'POST' as const, path: '/api/v1/lists/:id/items/posts' }
const FEEDS = { method: 'POST' as const, path: '/api/v1/lists/:id/items/rss-feed-items' }

type AddArgs =
  | { list_id: string; items: ListItemRef[] }
  | { list_id: string; source: { community: string } }

const ITEM = {
  type: 'object',
  properties: {
    item_type: { type: 'string', enum: ['post', 'rss_feed_item'] },
    entity: { type: 'string' },
  },
  required: ['item_type', 'entity'],
  additionalProperties: false,
}

const tool: Tool<
  AddArgs,
  { success: true; results: AddedListItem[] } | { success: true; posts: number; items: number }
> = {
  schema: {
    name: 'add_list_item',
    type: 'function',
    description: 'Add up to 100 visible posts or RSS items, or copy one community list.',
    parameters: {
      type: 'object',
      oneOf: [
        {
          type: 'object',
          properties: {
            list_id: LIST_ID_PARAMETER,
            items: { type: 'array', minItems: 1, maxItems: ADD_LIST_ITEM_LIMIT, items: ITEM },
          },
          required: ['list_id', 'items'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            list_id: LIST_ID_PARAMETER,
            source: {
              type: 'object',
              properties: { community: communityReferenceSchema },
              required: ['community'],
              additionalProperties: false,
            },
          },
          required: ['list_id', 'source'],
          additionalProperties: false,
        },
      ],
    },
    strict: null,
  },
  meta: {
    audience: 'user',
    title: 'Add List Item',
    plan: 'plus',
    requiredScopes: ['lists:read', 'lists:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [POSTS, FEEDS, IMPORT],
    selectApi: args => {
      if (args['source']) return [IMPORT]
      if (args['items'] === 'present') return [POSTS, FEEDS]
      const items = Array.isArray(args['items']) ? args['items'] : []
      const types = new Set(
        items.map(item =>
          typeof item === 'object' && item !== null
            ? (item as { item_type?: unknown }).item_type
            : undefined,
        ),
      )
      return [...(types.has('post') ? [POSTS] : []), ...(types.has('rss_feed_item') ? [FEEDS] : [])]
    },
    outputSchema: oneOfSchema(
      successSchema({
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item_type: { type: 'string' },
              entity: { type: 'string' },
              status: { type: 'string', enum: ['added', 'not_found', 'forbidden'] },
            },
            required: ['item_type', 'entity', 'status'],
            additionalProperties: true,
          },
        },
      }),
      successSchema({
        posts: { type: 'integer' },
        items: { type: 'integer' },
      }),
    ),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: AddArgs, invocationContext?: ToolInvocationContext) => {
      const { user, list } = await getListWriteContext(currentUser, args.list_id)
      const authority = getDelegatedToolAuthority(user, invocationContext)
      if ('source' in args) {
        const { community } = await loadCommunityForViewer(
          user,
          await entityIdOrMissing('community', args.source.community),
        )
        const copied = await importCommunityList(list, {
          communityId: community.id,
          viewer: entityRelationViewerFor(user),
          delegated: {
            grantedScopes: authority.grantedScopes,
            credentialOwnerId: authority.credentialOwnerId,
          },
        })
        return { success: true as const, posts: copied.posts, items: copied.items }
      }
      return {
        success: true as const,
        results: await addVisibleListItems(user, authority, list.id, args.items),
      }
    },
}

export default tool
