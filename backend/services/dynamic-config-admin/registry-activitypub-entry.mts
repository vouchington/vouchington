import {
  activityPubInboxConfig,
  MAXIMUM_ACTIVITY_AGE_DAYS_LIMIT,
} from '@services/ap-inbox-activities/config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const activityPubInboxRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'activitypub-inbox',
  label: 'ActivityPub Inbox',
  description: 'Rollout control for durable asynchronous ActivityPub inbox delivery.',
  config: activityPubInboxConfig,
  access: { update_roles: ['developer'] },
  fields: {
    async_delivery_enabled: {
      description: 'Persist accepted inbox requests and deliver them through the I/O worker.',
    },
    maximum_activity_age_days: {
      description: 'Maximum age of a signed inbound activity and its short-lived replay ledger.',
      minValue: 1,
      maxValue: MAXIMUM_ACTIVITY_AGE_DAYS_LIMIT,
      integer: true,
    },
  },
})
