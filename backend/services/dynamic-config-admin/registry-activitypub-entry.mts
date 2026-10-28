import {
  activityPubInboxConfig,
  MAXIMUM_ACTIVITY_AGE_DAYS_LIMIT,
  MINIMUM_TERMINAL_IDENTITY_RETENTION_DAYS,
  MAXIMUM_TERMINAL_IDENTITY_RETENTION_DAYS,
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
    terminal_identity_retention_days: {
      description:
        'Retention after a Like or Follow identity becomes terminal; always longer than every supported signed replay horizon.',
      minValue: MINIMUM_TERMINAL_IDENTITY_RETENTION_DAYS,
      maxValue: MAXIMUM_TERMINAL_IDENTITY_RETENTION_DAYS,
      integer: true,
    },
    maximum_activity_age_days: {
      description: 'Maximum age of a signed inbound activity and its short-lived replay ledger.',
      minValue: 1,
      maxValue: MAXIMUM_ACTIVITY_AGE_DAYS_LIMIT,
      integer: true,
    },
  },
})
