import {
  communityMembershipLimitsConfig,
  COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES,
} from '@services/communities/membership-limits'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import { conversationParticipantLimitsRegistryEntry } from './registry-conversation-participant-entry.mts'

export const communityMembershipLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'community-membership-limits-config',
  label: 'Community Membership Limits',
  description: 'Admission limits for community memberships and moderators, including owners.',
  config: communityMembershipLimitsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    moderators_per_community: {
      description: 'Maximum active owners and moderators per community.',
      minValue: 1,
      maxValue: COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES.moderators_per_community,
      integer: true,
    },
    communities_per_user: {
      description: 'Maximum active community memberships per user, including staff.',
      minValue: 1,
      maxValue: COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES.communities_per_user,
      integer: true,
    },
  },
})

export const admissionLimitRegistryEntries = [
  communityMembershipLimitsRegistryEntry,
  conversationParticipantLimitsRegistryEntry,
]
