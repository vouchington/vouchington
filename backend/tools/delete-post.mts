import { deletePost } from '@services/posts'
import type { Tool } from '@services/openai-agents/tool-types'
import { requireActiveToolUser } from './private-user.mts'
import { loadWritablePost, POST_ID_SCHEMA, POST_WRITE_SCOPES } from './post-write-tool-support.mts'
import { successSchema } from './output-schema-shapes.mts'

const tool: Tool<{ id: string }, { success: true }> = {
  schema: {
    name: 'delete_post',
    type: 'function',
    description:
      'Delete your own post or comment. Another user’s post cannot be deleted. A deleted or missing target is not found.',
    parameters: {
      type: 'object',
      properties: { id: POST_ID_SCHEMA },
      required: ['id'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Delete Own Post',
    plan: 'plus',
    requiredScopes: { mcp: POST_WRITE_SCOPES },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'DELETE', path: '/api/v1/posts/:idOrSlug' }],
    outputSchema: successSchema({}),
  },
  function:
    currentUser =>
    async ({ id }) => {
      const user = await requireActiveToolUser(currentUser)
      await deletePost(user, await loadWritablePost(user, id), { delegated: true })
      return { success: true }
    },
}

export default tool
