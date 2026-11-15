import {
  communityApplicationLimitsConfig,
  COMMUNITY_APPLICATION_LIMIT_MAX_VALUES,
} from '@services/communities/applications/question-limits'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const communityApplicationLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'community-application-limits-config',
  label: 'Community Application Limits',
  description: 'Size limits for the questions a community asks applicants.',
  config: communityApplicationLimitsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    questions_per_community: {
      description: 'Maximum active application questions per community.',
      minValue: 1,
      maxValue: COMMUNITY_APPLICATION_LIMIT_MAX_VALUES.questions_per_community,
      integer: true,
    },
    options_per_question: {
      description: 'Maximum options on one select application question.',
      minValue: 1,
      maxValue: COMMUNITY_APPLICATION_LIMIT_MAX_VALUES.options_per_question,
      integer: true,
    },
  },
})
