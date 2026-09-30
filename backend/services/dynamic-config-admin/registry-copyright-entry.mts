import { copyrightConfig } from '@services/copyright-notices/config'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'

export const copyrightRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'copyright',
  label: 'Copyright',
  description: 'Copyright notice automation and legal-operations switches.',
  config: copyrightConfig,
  access: { update_roles: ['developer'] },
  fields: {
    automaticProvisionalWithholding: {
      description:
        'Withhold the targets of a clear-screened signed-in DMCA notice before a moderator reviews it. Off keeps every notice for a moderator; read the copyright runbook before enabling.',
    },
    reviewTargetMinutes: {
      description:
        'Minutes a copyright case may wait for a moderator before the review-target sweep sends a Sentry warning. 0 means unset: no review-target page. Missed statutory deadlines page regardless.',
      min_value: 0,
      max_value: 10_080,
      integer: true,
    },
  },
})
