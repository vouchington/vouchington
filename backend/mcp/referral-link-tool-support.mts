import { successSchema } from './output-schema-shapes.mts'
import { componentSchema } from './route-response-schema.mts'

export type ReferralLinkIdArgs = { link_id: string }

export const REFERRAL_LINK_ID_PARAMETERS = {
  type: 'object',
  properties: {
    link_id: {
      type: 'string',
      format: 'uuid',
      description: 'The ID of a referral link the current user owns.',
    },
  },
  required: ['link_id'],
  additionalProperties: false,
}

/**
 * The link the REST twins return under `referral_link`, from the generated components. Every
 * referral link write tool refuses a suspended account first through `requireActiveToolUser`;
 * ownership, the child-link rule and the official-account rule stay in the shared service
 * commands the REST routes also call.
 */
export const REFERRAL_LINK_RESULT_SCHEMA = successSchema({
  referral_link: componentSchema('UserReferralLink'),
})
export const REFERRAL_LINK_SUCCESS_SCHEMA = successSchema({})
