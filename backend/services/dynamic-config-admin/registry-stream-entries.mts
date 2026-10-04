import { entityReconciliationConfig } from '@services/entity-listener-reconciliation/work-limits'
import { referralCrawlDispatchConfig } from '@services/crawler-referral-links/work-limits'
import { referralUnfurlDispatchConfig } from '@services/referral-link-unfurl/work-limits'
import { friendsDispatchConfig } from '@services/friend-recommendations/work-limits'
import { crawlDispatchConfig } from '@services/crawls/work-limits'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'

export const streamDynamicConfigRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'crawl-dispatch-work-config',
    label: 'Crawl URL dispatch',
    description: 'Page sizes and per-run budgets for per-hostname and tier crawl URL dispatch.',
    config: crawlDispatchConfig,
    access: { update_roles: ['developer'] },
    fields: {
      weekly_refresh_batch_size: {
        description: 'Hostname rows per weekly refresh page.',
        min_value: 1,
        max_value: 5000,
        integer: true,
      },
      hostname_batch_size: {
        description: 'Maximum hostnames per enqueue batch in hostname scheduling.',
        min_value: 1,
        max_value: 5000,
        integer: true,
      },
      batch_size: {
        description: 'Maximum URLs per enqueue batch.',
        min_value: 1,
        max_value: 5000,
        integer: true,
      },
      max_rows_per_run: {
        description: 'Maximum URLs per run; a fixed-sweep continuation resumes remaining work.',
        min_value: 1,
        max_value: 100000,
        integer: true,
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'referral-crawl-dispatch-work-config',
    label: 'Referral crawl dispatch',
    description:
      'Bounded dispatch pages with fixed sweep continuations for remaining eligible work.',
    config: referralCrawlDispatchConfig,
    access: { update_roles: ['developer'] },
    fields: {
      failure_retry_hours: {
        description: 'Hours before retrying a failed referral crawl.',
        min_value: 1,
        max_value: 24,
        integer: true,
      },
      batch_size: {
        description: 'Maximum rows per enqueue batch.',
        min_value: 1,
        max_value: 5000,
        integer: true,
      },
      max_rows_per_run: {
        description: 'Maximum eligible rows per dispatch run.',
        min_value: 1,
        max_value: 100000,
        integer: true,
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'referral-unfurl-dispatch-work-config',
    label: 'Referral unfurl recovery',
    description:
      'Bounded dispatch pages with fixed sweep continuations for remaining eligible work.',
    config: referralUnfurlDispatchConfig,
    access: { update_roles: ['developer'] },
    fields: {
      batch_size: {
        description: 'Maximum rows per enqueue batch.',
        min_value: 1,
        max_value: 5000,
        integer: true,
      },
      max_rows_per_run: {
        description: 'Maximum eligible rows per dispatch run.',
        min_value: 1,
        max_value: 100000,
        integer: true,
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'friends-dispatch-work-config',
    label: 'Friend synchronization dispatch',
    description:
      'Bounded dispatch pages with fixed sweep continuations for remaining eligible work.',
    config: friendsDispatchConfig,
    access: { update_roles: ['developer'] },
    fields: {
      batch_size: {
        description: 'Maximum rows per enqueue batch.',
        min_value: 1,
        max_value: 5000,
        integer: true,
      },
      max_rows_per_provider_per_run: {
        description: 'Maximum eligible rows per dispatch run.',
        min_value: 1,
        max_value: 100000,
        integer: true,
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'entity-reconciliation-work-config',
    label: 'Entity listener reconciliation',
    description:
      'Bounded reconciliation with exact change cursors inside a fixed replica-safe window.',
    config: entityReconciliationConfig,
    access: { update_roles: ['developer'] },
    fields: {
      batch_size: {
        description: 'Maximum candidates per cursor batch.',
        min_value: 1,
        max_value: 5000,
        integer: true,
      },
      max_rows_per_run: {
        description: 'Maximum candidates per run before a durable continuation.',
        min_value: 1,
        max_value: 100000,
        integer: true,
      },
    },
  }),
]
