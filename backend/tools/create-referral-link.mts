import type { BasicUser } from '@services/users/types'
import {
  createUserReferralLink,
  type UserReferralLink,
} from '@services/user-referral-program-links'
import { requireActiveToolUser } from './private-user.mts'
import { REFERRAL_LINK_RESULT_SCHEMA } from './referral-link-tool-support.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type CreateReferralLinkArgs = {
  referral_program_id: string
  url: string
  label?: string | null
  user_id?: string | null
}

const tool: Tool<CreateReferralLinkArgs, { success: true; referral_link: UserReferralLink }> = {
  schema: {
    name: 'create_referral_link',
    type: 'function',
    description:
      'Add a referral link of your own to a referral program. The URL has to be a valid link for that program. Adding a link you already have for the program reactivates it and keeps its label unless you send a new one.',
    parameters: {
      type: 'object',
      properties: {
        referral_program_id: {
          type: 'string',
          format: 'uuid',
          description: 'The ID of the referral program topic the link belongs to.',
        },
        url: { type: 'string', minLength: 1, description: 'The referral link URL.' },
        label: {
          anyOf: [{ type: 'null' }, { type: 'string' }],
          description: 'A short label for the link, or null for none.',
        },
        user_id: {
          anyOf: [{ type: 'null' }, { type: 'string', format: 'uuid' }],
          description:
            'The account the link belongs to. Leave it out for your own; only an administrator can use another account.',
        },
      },
      required: ['referral_program_id', 'url'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Create Referral Link',
    plan: 'plus',
    requiredScopes: { mcp: ['referral-links:read', 'referral-links:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [{ method: 'POST', path: '/api/v1/referral-links' }],
    outputSchema: REFERRAL_LINK_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: CreateReferralLinkArgs) => {
    const user = await requireActiveToolUser(currentUser)
    const referral_link = await createUserReferralLink(user, {
      user_id: args.user_id || user.id,
      referral_program_id: args.referral_program_id,
      url: args.url,
      label: args.label,
    })
    return { success: true, referral_link }
  },
}

export default tool
