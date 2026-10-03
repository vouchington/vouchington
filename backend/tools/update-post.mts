import assert from 'http-assert'
import { isAdminUser } from '@services/users'
import { updatePost, type UpdatePostChanges } from '@services/posts'
import { assertPostUpdatePreflight } from '@services/posts/update/validation'
import { getUserActivePlan } from '@services/memberships'
import type { Tool } from '@services/openai-agents/tool-types'
import { requireActiveToolUser } from './private-user.mts'
import { toMcpPost, type McpPost } from './mcp-post-output.mts'
import {
  loadWritablePost,
  postWriteParameters,
  POST_ID_SCHEMA,
  POST_WRITE_SCOPES,
  POST_WRITE_RESULT_SCHEMA,
} from './post-write-tool-support.mts'

type Args = UpdatePostChanges & { id: string }
const parameters = postWriteParameters('PATCH:/api/v1/posts/:idOrSlug')
const tool: Tool<Args, { success: true; post: McpPost }> = {
  schema: {
    name: 'update_post',
    type: 'function',
    description:
      'Edit your own post or comment. Send only fields to change; archive true archives it and archive false restores it. Content edits retain the REST edit window and per-type rules.',
    parameters: {
      ...parameters,
      properties: { ...parameters.properties, id: POST_ID_SCHEMA },
      required: ['id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Edit or Archive Own Post',
    plan: 'plus',
    requiredScopes: { mcp: POST_WRITE_SCOPES },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    api: [{ method: 'PATCH', path: '/api/v1/posts/:idOrSlug' }],
    outputSchema: POST_WRITE_RESULT_SCHEMA,
  },
  function: currentUser => async args => {
    const user = await requireActiveToolUser(currentUser)
    const { id, ...changes } = args
    const post = await loadWritablePost(user, id)
    assert(changes.slug === undefined || isAdminUser(user), 403, 'Only admins can set a post slug')
    assertPostUpdatePreflight(user, post, changes)
    const membershipPlan =
      changes.structured_data !== undefined ||
      changes.categories !== undefined ||
      changes.title !== undefined ||
      changes.markdown !== undefined
        ? await getUserActivePlan(user.id)
        : null
    return {
      success: true,
      post: await toMcpPost(await updatePost(user, post, changes, membershipPlan)),
    }
  },
}

export default tool
