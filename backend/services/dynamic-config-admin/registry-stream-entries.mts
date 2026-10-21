import { entityReconciliationConfig } from '@services/entity-listener-reconciliation/work-limits'
import { referralCrawlDispatchConfig } from '@services/crawler-referral-links/work-limits'
import { referralUnfurlDispatchConfig } from '@services/referral-link-unfurl/work-limits'
import { friendsDispatchConfig } from '@services/friend-recommendations/work-limits'
import { crawlDispatchConfig, crawlCleanupMaxValues } from '@services/crawls/work-limits'
import { crawlerRefreshWorkConfig } from '@services/crawlers/refresh-limits'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const streamDynamicConfigRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'crawl-dispatch-work-config',
    label: 'Crawl URL dispatch',
    description: 'Page sizes and per-run budgets for per-hostname and tier crawl URL dispatch.',
    config: crawlDispatchConfig,
    access: { update_roles: ['developer'] },
    fields: {
      cleanup_max_batches_per_run: {
        description: 'Maximum deletion pages per retained cleanup run.',
        minValue: 1,
        maxValue: crawlCleanupMaxValues.maxBatches,
        integer: true,
      },
      cleanup_batch_size: {
        description: 'Maximum invalid crawls deleted per retained cleanup run.',
        minValue: 1,
        maxValue: crawlCleanupMaxValues.batchSize,
        integer: true,
      },
      cleanup_age_days: {
        description: 'Minimum age in days before an invalid crawl is eligible for cleanup.',
        minValue: 1,
        maxValue: crawlCleanupMaxValues.ageDays,
        integer: true,
      },
      weekly_refresh_batch_size: {
        description: 'Hostname rows per weekly refresh page.',
        minValue: 1,
        maxValue: 5000,
        integer: true,
      },
      weekly_refresh_max_rows_per_run: {
        description: 'Maximum weekly hostname refresh rows before retained-job continuation.',
        minValue: 1,
        maxValue: 50000,
        integer: true,
      },
      hostname_batch_size: {
        description: 'Maximum hostnames per enqueue batch in hostname scheduling.',
        minValue: 1,
        maxValue: 5000,
        integer: true,
      },
      hostname_max_rows_per_run: {
        description:
          'Maximum hostname candidates and threshold probes per run before continuation.',
        minValue: 1,
        maxValue: 100000,
        integer: true,
      },
      batch_size: {
        description: 'Maximum URLs per enqueue batch.',
        minValue: 1,
        maxValue: 5000,
        integer: true,
      },
      max_rows_per_run: {
        description: 'Maximum URLs per run; a fixed-sweep continuation resumes remaining work.',
        minValue: 1,
        maxValue: 100000,
        integer: true,
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'crawler-refresh-work-config',
    label: 'Crawler refresh work',
    description:
      'Bounded URL candidate selection during crawler retries and weekly hostname refresh.',
    config: crawlerRefreshWorkConfig,
    access: { update_roles: ['developer'] },
    fields: {
      retry_crawl_url_count: {
        description: 'Maximum alternative URL candidates considered for one hostname.',
        minValue: 1,
        maxValue: 20,
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
        minValue: 1,
        maxValue: 24,
        integer: true,
      },
      batch_size: {
        description: 'Maximum rows per enqueue batch.',
        minValue: 1,
        maxValue: 5000,
        integer: true,
      },
      max_rows_per_run: {
        description: 'Maximum eligible rows per dispatch run.',
        minValue: 1,
        maxValue: 100000,
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
        minValue: 1,
        maxValue: 5000,
        integer: true,
      },
      max_rows_per_run: {
        description: 'Maximum eligible rows per dispatch run.',
        minValue: 1,
        maxValue: 100000,
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
        minValue: 1,
        maxValue: 5000,
        integer: true,
      },
      max_rows_per_provider_per_run: {
        description: 'Maximum eligible rows per dispatch run.',
        minValue: 1,
        maxValue: 100000,
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
      lookback_seconds: {
        description: 'Fixed source lookback; raise after an outage.',
        minValue: 1,
        maxValue: 31536000,
        integer: true,
      },
      replica_margin_seconds: {
        description: 'Replica visibility safety margin.',
        minValue: 1,
        maxValue: 3600,
        integer: true,
      },
      batch_size: {
        description: 'Maximum candidates per cursor batch.',
        minValue: 1,
        maxValue: 5000,
        integer: true,
      },
      max_rows_per_run: {
        description: 'Maximum candidates per run before a durable continuation.',
        minValue: 1,
        maxValue: 100000,
        integer: true,
      },
    },
  }),
]
