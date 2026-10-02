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
    evidenceRetentionDeletion: {
      description:
        'Let the hourly sweep delete the stored evidence and claimant personal data of closed copyright cases once the retention period has passed, keeping only the minimal repeat-infringer record. Needs a retention period below and the evidence-bucket delete permission; read the copyright runbook before enabling.',
    },
    evidenceRetentionDays: {
      description:
        'Days a copyright case is kept after its last lifecycle event before the retention sweep may delete its evidence. 0 means unset: nothing is deleted even when the switch is on. Set only to a counsel-approved period.',
      min_value: 0,
      max_value: 3650,
      integer: true,
    },
    staydownMatching: {
      description:
        'Hash media a moderator confirmed as infringing and send later uploads of the same or a near-identical image to staff review. Never blocks, hides or delays an upload. Off until counsel decides Voucha is an online content-sharing service provider; read the copyright runbook before enabling.',
    },
  },
})
