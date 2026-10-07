import createHttpError from 'http-errors'
import type { BasicUser } from '@services/users/types'
import {
  activateUserReferralLink,
  type UserReferralLink,
} from '@services/user-referral-program-links'
import { requireActiveToolUser } from './private-user.mts'
import {
  REFERRAL_LINK_ID_PARAMETERS,
  REFERRAL_LINK_RESULT_SCHEMA,
  type ReferralLinkIdArgs,
} from './referral-link-tool-support.mts'
import type { Tool } from '@services/openai-agents/tool-types'

const tool: Tool<ReferralLinkIdArgs, { success: true; referral_link: UserReferralLink }> = {
  schema: {
    name: 'activate_referral_link',
    type: 'function',
    description:
      'Turn a referral link you own back on so it is shown again. Links the system derived from another link follow their parent and cannot be turned on by themselves.',
    parameters: REFERRAL_LINK_ID_PARAMETERS,
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Activate Referral Link',
    plan: 'plus',
    requiredScopes: { mcp: ['referral-links:read', 'referral-links:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [{ method: 'POST', path: '/api/v1/referral-links/:linkId/activations' }],
    outputSchema: REFERRAL_LINK_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: ReferralLinkIdArgs) => {
    const referral_link = await activateUserReferralLink(
      await requireActiveToolUser(currentUser),
      args.link_id,
    )
    if (!referral_link) throw createHttpError(404, 'Referral link not found')
    return { success: true, referral_link }
  },
}

export default tool
