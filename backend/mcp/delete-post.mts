import { deletePost } from '@services/posts'
import type { Tool } from '@services/openai-agents/tool-types'
import { requireActiveToolUser } from './private-user.mts'
import { loadWritablePost, POST_ID_SCHEMA, POST_WRITE_SCOPES } from './post-write-tool-support.mts'
import { successSchema } from './output-schema-shapes.mts'
import type { PrivateUser } from '@services/users/types'

const tool: Tool<{ id: string }, { success: true }> = {
  schema: {
    name: 'delete_post',
    type: 'function',
    description:
      'Delete a post or comment when you have the same delete permission as on the website. A deleted or missing target is not found.',
    parameters: {
      type: 'object',
      properties: { id: POST_ID_SCHEMA },
      required: ['id'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    audience: 'user',
    title: 'Delete Post',
    plan: 'plus',
    requiredScopes: POST_WRITE_SCOPES,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'DELETE', path: '/api/v1/posts/:idOrSlug' }],
    outputSchema: successSchema({}),
  },
  function:
    currentUser =>
    async ({ id }) => {
      const user = await requireActiveToolUser(currentUser)
      await deleteAuthorizedPost(user, id)
      return { success: true }
    },
}

async function deleteAuthorizedPost(user: PrivateUser, id: string): Promise<void> {
  const { post, communityMemberRole } = await loadWritablePost(user, id, 'delete')
  await deletePost(user, post, { communityMemberRole, delegated: true })
}

export default tool
