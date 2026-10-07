import {
  createProfileLink,
  type ProfileLink,
  type ProfileLinkType,
} from '@services/my/profile-links'
import type { BasicUser } from '@services/users/types'
import {
  PROFILE_LINK_FIELD_PARAMETERS,
  PROFILE_LINK_RESULT_SCHEMA,
  PROFILE_LINK_TYPE_PARAMETER,
  type ProfileLinkToolFields,
} from './profile-tool-support.mts'
import { requireActiveToolUser } from './private-user.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type AddMyProfileLinkArgs = ProfileLinkToolFields & { link_type: ProfileLinkType }

const tool: Tool<AddMyProfileLinkArgs, { success: true; profile_link: ProfileLink }> = {
  schema: {
    name: 'add_my_profile_link',
    type: 'function',
    description:
      "Add a link to the current user's profile, after the links already there. A url link needs a url; a platform link takes a handle. A profile holds at most 20 links, and links to blocked domains are refused.",
    parameters: {
      type: 'object',
      properties: { link_type: PROFILE_LINK_TYPE_PARAMETER, ...PROFILE_LINK_FIELD_PARAMETERS },
      required: ['link_type'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Add My Profile Link',
    plan: 'plus',
    requiredScopes: { mcp: ['profile:read', 'profile:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [{ method: 'POST', path: '/api/v1/my/profile/links' }],
    outputSchema: PROFILE_LINK_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: AddMyProfileLinkArgs) => {
    const user = await requireActiveToolUser(currentUser)
    return { success: true, profile_link: await createProfileLink(user.id, args) }
  },
}

export default tool
