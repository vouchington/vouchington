import { updateProfileLink, type ProfileLink } from '@services/my/profile-links'
import type { BasicUser } from '@services/users/types'
import {
  PROFILE_LINK_FIELD_PARAMETERS,
  PROFILE_LINK_ID_PARAMETER,
  PROFILE_LINK_RESULT_SCHEMA,
  type ProfileLinkToolFields,
} from './profile-tool-support.mts'
import { requireActiveToolUser } from './private-user.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type UpdateMyProfileLinkArgs = ProfileLinkToolFields & { link_id: string }

const tool: Tool<UpdateMyProfileLinkArgs, { success: true; profile_link: ProfileLink }> = {
  schema: {
    name: 'update_my_profile_link',
    type: 'function',
    description:
      "Change the url, handle or name of one of the current user's profile links. Only the fields sent change; send null to clear one. The link's kind and position stay the same, and another user's link cannot be changed.",
    parameters: {
      type: 'object',
      properties: { link_id: PROFILE_LINK_ID_PARAMETER, ...PROFILE_LINK_FIELD_PARAMETERS },
      required: ['link_id'],
      minProperties: 2,
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Update My Profile Link',
    plan: 'plus',
    requiredScopes: { mcp: ['profile:read', 'profile:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    api: [{ method: 'PATCH', path: '/api/v1/my/profile/links/:id' }],
    outputSchema: PROFILE_LINK_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: UpdateMyProfileLinkArgs) => {
    const { link_id, ...fields } = args
    const user = await requireActiveToolUser(currentUser)
    return { success: true, profile_link: await updateProfileLink(user.id, link_id, fields) }
  },
}

export default tool
