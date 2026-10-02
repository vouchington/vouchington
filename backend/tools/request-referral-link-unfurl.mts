import type { BasicUser } from '@services/users/types'
import { requestReferralLinkUnfurl } from '@services/referral-link-unfurl'
import type { UserReferralLink } from '@services/user-referral-program-links'
import { requireActiveToolUser } from './private-user.mts'
import {
  REFERRAL_LINK_ID_PARAMETERS,
  REFERRAL_LINK_RESULT_SCHEMA,
  type ReferralLinkIdArgs,
} from './referral-link-tool-support.mts'
import type { Tool } from '@services/openai-agents/tool-types'

const tool: Tool<ReferralLinkIdArgs, { success: true; referral_link: UserReferralLink }> = {
  schema: {
    name: 'request_referral_link_unfurl',
    type: 'function',
    description:
      'Ask for the per-card links of an Amex all-cards referral link you own to be derived. The work runs in the background; the returned link shows when it was requested. Only a link of the Amex all-cards program whose owner has a paid membership can be unfurled.',
    parameters: REFERRAL_LINK_ID_PARAMETERS,
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Request Referral Link Unfurl',
    plan: 'plus',
    requiredScopes: { mcp: ['referral-links:read', 'referral-links:write'] },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    api: [{ method: 'POST', path: '/api/v1/referral-links/:linkId/unfurls' }],
    outputSchema: REFERRAL_LINK_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: ReferralLinkIdArgs) => {
    const user = await requireActiveToolUser(currentUser)
    return { success: true, referral_link: await requestReferralLinkUnfurl(user, args.link_id) }
  },
}

export default tool
