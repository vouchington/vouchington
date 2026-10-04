import {
  copyrightNoticesAdditionalMaxValues,
  copyrightSweepConfig,
} from '@services/copyright-notices/work-limits'
import {
  accountDataRequestsAdditionalMaxValues,
  dataRequestConfig,
} from '@services/account-data-requests/work-limits'
import { kagiSmallWebImportConfig } from '@services/kagi-smallweb/import-config'
import { apiKeyExpiryConfig } from '@services/api-keys/work-limits'
import {
  membershipWorkConfig,
  membershipAdditionalWorkMaxValues,
} from '@services/memberships/work-limits'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'

export const workDynamicConfigRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'kagi-smallweb-config',
    label: 'Kagi Smallweb',
    description: 'Controls for Kagi Small Web feed import. Disabled by default.',
    config: kagiSmallWebImportConfig,
    access: { update_roles: ['developer'] },
    fields: {
      enabled: { description: 'Enable Kagi Small Web feed import dispatcher.' },
      candidate_batch_size: {
        description: 'Maximum fetched feed URLs per indexed deduplication probe.',
        min_value: 1,
        max_value: 5000,
        integer: true,
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'api-keys-work-config',
    label: 'API key expiry',
    description: 'Controls API key reminder pages and dispatch budgets.',
    config: apiKeyExpiryConfig,
    access: { update_roles: ['developer'] },
    fields: {
      bloom_batch_size: {
        description: 'API key hashes per bloom population chunk.',
        min_value: 1,
        max_value: 10000,
        integer: true,
      },
      batch_size: {
        description: 'Maximum rows per page.',
        min_value: 1,
        max_value: 5000,
        integer: true,
      },
      max_batches_per_run: {
        description:
          'Maximum pages per run; remaining work resumes through durable state or a continuation.',
        min_value: 1,
        max_value: 2000,
        integer: true,
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'account-data-requests-work-config',
    label: 'Account data requests',
    description: 'Controls export recovery and expired-export cleanup budgets.',
    config: dataRequestConfig,
    access: { update_roles: ['developer'] },
    fields: {
      ...Object.fromEntries(
        Object.entries(accountDataRequestsAdditionalMaxValues).map(([field, max_value]) => [
          field,
          { description: field.replaceAll('_', ' '), min_value: 1, max_value, integer: true },
        ]),
      ),
      batch_size: {
        description: 'Maximum rows per page.',
        min_value: 1,
        max_value: 5000,
        integer: true,
      },
      max_batches_per_run: {
        description:
          'Maximum pages per run; remaining work resumes through durable state or a continuation.',
        min_value: 1,
        max_value: 2000,
        integer: true,
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'memberships-work-config',
    label: 'Membership processing',
    description: 'Controls membership expiry normalization and renewal notification budgets.',
    config: membershipWorkConfig,
    access: { update_roles: ['developer'] },
    fields: {
      ...Object.fromEntries(
        Object.entries(membershipAdditionalWorkMaxValues).map(([field, max_value]) => [
          field,
          {
            description: `Membership processing ${field.replaceAll('_', ' ')}.`,
            min_value: 1,
            max_value,
            integer: true,
          },
        ]),
      ),
      batch_size: {
        description: 'Maximum rows per page.',
        min_value: 1,
        max_value: 5000,
        integer: true,
      },
      max_batches_per_run: {
        description:
          'Maximum pages per run; remaining work resumes through durable state or a continuation.',
        min_value: 1,
        max_value: 2000,
        integer: true,
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'copyright-notices-work-config',
    label: 'Copyright reconciliation',
    description: 'Controls copyright action, delivery, and agent reconciliation budgets.',
    config: copyrightSweepConfig,
    access: { update_roles: ['developer'] },
    fields: {
      ...Object.fromEntries(
        Object.entries(copyrightNoticesAdditionalMaxValues).map(([field, max_value]) => [
          field,
          { description: field.replaceAll('_', ' '), min_value: 1, max_value, integer: true },
        ]),
      ),
      batch_size: {
        description: 'Maximum rows per page.',
        min_value: 1,
        max_value: 100,
        integer: true,
      },
      max_batches_per_run: {
        description:
          'Maximum pages per run; remaining work resumes through durable state or a continuation.',
        min_value: 1,
        max_value: 2000,
        integer: true,
      },
    },
  }),
]
