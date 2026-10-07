import { updateProfileImageId } from '@services/my/identity'
import { updateUserFields } from '@services/users/update-fields'
import type { BasicUser, PrivateUser } from '@services/users/types'
import { IDENTITY_PARAMETERS, IDENTITY_RESULT_SCHEMA } from './profile-tool-support.mts'
import { requireActiveToolUser, requirePrivateToolUser } from './private-user.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type UpdateMyDisplayIdentityArgs = {
  use_display_name_from?: NonNullable<PrivateUser['use_display_name_from']>
  profile_image_id?: string | null
}

type UpdateMyDisplayIdentityResult = {
  success: true
  identity: {
    use_display_name_from: PrivateUser['use_display_name_from']
    profile_image_id: string | null
  }
}

const tool: Tool<UpdateMyDisplayIdentityArgs, UpdateMyDisplayIdentityResult> = {
  schema: {
    name: 'update_my_display_identity',
    type: 'function',
    description:
      "Change where the current user's display name comes from (the username or a connected sign-in account) and the avatar image. Only the fields sent change. The username itself cannot be changed here, and an avatar must be an image the user uploaded.",
    parameters: IDENTITY_PARAMETERS,
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Update My Display Identity',
    plan: 'plus',
    requiredScopes: { mcp: ['profile:read', 'profile:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    api: [{ method: 'PATCH', path: '/api/v1/my/identity' }],
    outputSchema: IDENTITY_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: UpdateMyDisplayIdentityArgs) => {
    const user = await requireActiveToolUser(currentUser)
    // The same two commands, in the same order, as PATCH /api/v1/my/identity.
    if (args.use_display_name_from !== undefined)
      await updateUserFields(user.id, { use_display_name_from: args.use_display_name_from })
    if (args.profile_image_id !== undefined)
      await updateProfileImageId(user.id, args.profile_image_id)
    const { use_display_name_from, profile_image_id } = await requirePrivateToolUser(currentUser)
    return {
      success: true,
      identity: {
        use_display_name_from: use_display_name_from ?? null,
        profile_image_id: profile_image_id ?? null,
      },
    }
  },
}

export default tool
