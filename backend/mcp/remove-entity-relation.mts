import type { BasicUser } from '@services/users/types'
import { removePostHashtag } from '@services/posts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { requirePrivateToolUser } from './private-user.mts'
import type { Tool, ToolInvocationContext } from '@services/openai-agents/tool-types'
import { objectSchema } from './output-schema-shapes.mts'

type RemoveEntityRelationArgs = { action: 'remove_tag'; post_id: string; tag: string }
type RemoveEntityRelationResult = { post_id: string; tag: string; removed: boolean }

const text = { type: 'string' }

const tool: Tool<RemoveEntityRelationArgs, RemoveEntityRelationResult> = {
  schema: {
    name: 'remove_entity_relation',
    type: 'function',
    description:
      'Remove a hashtag you added to your own post. A hashtag written in the post title or text cannot be removed here; edit the text instead. Removing a hashtag the post does not carry changes nothing and reports removed false.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['remove_tag'],
          description: 'What to remove. Only hashtags on a post can be removed for now.',
        },
        post_id: { type: 'string', description: 'The ID or slug of the post.' },
        tag: { type: 'string', description: 'The hashtag, for example #travel-tips.' },
      },
      required: ['action', 'post_id', 'tag'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Remove Entity Relation',
    plan: 'plus',
    requiredScopes: { mcp: ['entity-relations:read', 'entity-relations:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    api: [{ method: 'PATCH', path: '/api/v1/posts/:idOrSlug' }],
    outputSchema: objectSchema({ post_id: text, tag: text, removed: { type: 'boolean' } }),
  },
  function:
    (currentUser: BasicUser) =>
    async (
      args: RemoveEntityRelationArgs,
      invocationContext?: ToolInvocationContext,
    ): Promise<RemoveEntityRelationResult> => {
      const currentPrivateUser = await requirePrivateToolUser(currentUser)
      const authority = getDelegatedToolAuthority(currentPrivateUser, invocationContext)
      return removePostHashtag(currentPrivateUser, args.post_id, args.tag, authority)
    },
}

export default tool
