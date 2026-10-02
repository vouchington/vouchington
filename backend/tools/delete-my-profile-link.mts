import { deleteProfileLink } from '@services/my/profile-links'
import type { BasicUser } from '@services/users/types'
import { PROFILE_LINK_ID_PARAMETER } from './profile-tool-support.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type DeleteMyProfileLinkArgs = { link_id: string }

const tool: Tool<DeleteMyProfileLinkArgs, { success: true }> = {
  schema: {
    name: 'delete_my_profile_link',
    type: 'function',
    description:
      "Delete one of the current user's profile links. Deleting a link that is already gone fails as not found, and another user's link cannot be deleted.",
    parameters: {
      type: 'object',
      properties: { link_id: PROFILE_LINK_ID_PARAMETER },
      required: ['link_id'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Delete My Profile Link',
    plan: 'plus',
    requiredScopes: { mcp: ['profile:read', 'profile:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'DELETE', path: '/api/v1/my/profile/links/:id' }],
    outputSchema: successSchema({}),
  },
  function: (currentUser: BasicUser) => async (args: DeleteMyProfileLinkArgs) => {
    const user = await requireActiveToolUser(currentUser)
    await deleteProfileLink(user.id, args.link_id)
    return { success: true }
  },
}

export default tool
