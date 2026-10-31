import {
  moderationRetentionQueueConfig,
  partitionCleanupConfig,
  PARTITION_CLEANUP_MAX_PARTITIONS,
} from '@queues/psql/config'
import {
  copyrightNoticesAdditionalMaxValues,
  copyrightSweepConfig,
} from '@services/copyright-notices/work-limits'
import {
  accountDataRequestsAdditionalMaxValues,
  dataRequestConfig,
} from '@services/account-data-requests/work-limits'
import { apiKeyExpiryConfig } from '@services/api-keys/work-limits'
import {
  membershipWorkConfig,
  membershipAdditionalWorkMaxValues,
} from '@services/memberships/work-limits'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const workDynamicConfigRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'psql-partition-cleanup-config',
    label: 'Partition cleanup',
    description: 'Caps each monthly partition retirement pass and its cross-worker concurrency.',
    config: partitionCleanupConfig,
    access: { update_roles: ['developer'] },
    fields: {
      max_partitions_per_run: {
        description: 'Maximum monthly partition candidates read per job.',
        minValue: 1,
        maxValue: PARTITION_CLEANUP_MAX_PARTITIONS,
        integer: true,
      },
      concurrency: {
        description: 'Maximum concurrent monthly partition cleanup jobs across workers.',
        minValue: 1,
        maxValue: 1,
        integer: true,
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'psql-moderation-retention-config',
    label: 'Moderation retention queue',
    description: 'Serial admission for moderation-history cleanup across worker processes.',
    config: moderationRetentionQueueConfig,
    access: { update_roles: ['developer'] },
    fields: {
      concurrency: {
        description: 'Maximum concurrent moderation-history cleanup jobs across workers.',
        minValue: 1,
        maxValue: 1,
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
        minValue: 1,
        maxValue: 10000,
        integer: true,
      },
      batch_size: {
        description: 'Maximum rows per page.',
        minValue: 1,
        maxValue: 5000,
        integer: true,
      },
      max_batches_per_run: {
        description:
          'Maximum pages per run; remaining work resumes through durable state or a continuation.',
        minValue: 1,
        maxValue: 2000,
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
        Object.entries(accountDataRequestsAdditionalMaxValues).map(([field, maxValue]) => [
          field,
          { description: field.replaceAll('_', ' '), minValue: 1, maxValue, integer: true },
        ]),
      ),
      batch_size: {
        description: 'Maximum rows per page.',
        minValue: 1,
        maxValue: 5000,
        integer: true,
      },
      max_batches_per_run: {
        description:
          'Maximum pages per run; remaining work resumes through durable state or a continuation.',
        minValue: 1,
        maxValue: 2000,
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
        Object.entries(membershipAdditionalWorkMaxValues).map(([field, maxValue]) => [
          field,
          {
            description: `Membership processing ${field.replaceAll('_', ' ')}.`,
            minValue: 1,
            maxValue,
            integer: true,
          },
        ]),
      ),
      batch_size: {
        description: 'Maximum rows per page.',
        minValue: 1,
        maxValue: 5000,
        integer: true,
      },
      max_batches_per_run: {
        description:
          'Maximum pages per run; remaining work resumes through durable state or a continuation.',
        minValue: 1,
        maxValue: 2000,
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
        Object.entries(copyrightNoticesAdditionalMaxValues).map(([field, maxValue]) => [
          field,
          { description: field.replaceAll('_', ' '), minValue: 1, maxValue, integer: true },
        ]),
      ),
      batch_size: {
        description: 'Maximum rows per page.',
        minValue: 1,
        maxValue: 100,
        integer: true,
      },
      max_batches_per_run: {
        description:
          'Maximum pages per run; remaining work resumes through durable state or a continuation.',
        minValue: 1,
        maxValue: 2000,
        integer: true,
      },
    },
  }),
]
