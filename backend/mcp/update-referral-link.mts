import createHttpError from 'http-errors'
import type { BasicUser } from '@services/users/types'
import {
  updateUserReferralLink,
  type UserReferralLink,
} from '@services/user-referral-program-links'
import { requireActiveToolUser } from './private-user.mts'
import {
  REFERRAL_LINK_ID_PARAMETERS,
  REFERRAL_LINK_RESULT_SCHEMA,
} from './referral-link-tool-support.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type UpdateReferralLinkArgs = { link_id: string; label?: string | null }

const tool: Tool<UpdateReferralLinkArgs, { success: true; referral_link: UserReferralLink }> = {
  schema: {
    name: 'update_referral_link',
    type: 'function',
    description:
      'Change the label of a referral link you own. Send a null label to clear it. Links the system derived from another link are managed through their parent and cannot be changed.',
    parameters: {
      type: 'object',
      properties: {
        link_id: REFERRAL_LINK_ID_PARAMETERS.properties.link_id,
        label: {
          anyOf: [{ type: 'null' }, { type: 'string' }],
          description: 'The new label, or null for none.',
        },
      },
      required: ['link_id'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Update Referral Link',
    plan: 'plus',
    requiredScopes: { mcp: ['referral-links:read', 'referral-links:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    api: [{ method: 'PATCH', path: '/api/v1/referral-links/:linkId' }],
    outputSchema: REFERRAL_LINK_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: UpdateReferralLinkArgs) => {
    const user = await requireActiveToolUser(currentUser)
    const referral_link = await updateUserReferralLink(user, args.link_id, { label: args.label })
    if (!referral_link) throw createHttpError(404, 'Referral link not found')
    return { success: true, referral_link }
  },
}

export default tool
