import type { BasicUser } from '@services/users/types'
import { deleteUserReferralLink } from '@services/user-referral-program-links'
import { requireActiveToolUser } from './private-user.mts'
import {
  REFERRAL_LINK_ID_PARAMETERS,
  REFERRAL_LINK_SUCCESS_SCHEMA,
  type ReferralLinkIdArgs,
} from './referral-link-tool-support.mts'
import type { Tool } from '@services/openai-agents/tool-types'

const tool: Tool<ReferralLinkIdArgs, { success: true }> = {
  schema: {
    name: 'delete_referral_link',
    type: 'function',
    description:
      'Delete a referral link you own, along with the links the system derived from it. Deleting a link that is already deleted fails as not found.',
    parameters: REFERRAL_LINK_ID_PARAMETERS,
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Delete Referral Link',
    plan: 'plus',
    requiredScopes: { mcp: ['referral-links:read', 'referral-links:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'DELETE', path: '/api/v1/referral-links/:linkId' }],
    outputSchema: REFERRAL_LINK_SUCCESS_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: ReferralLinkIdArgs) => {
    await deleteUserReferralLink(await requireActiveToolUser(currentUser), args.link_id)
    return { success: true }
  },
}

export default tool
