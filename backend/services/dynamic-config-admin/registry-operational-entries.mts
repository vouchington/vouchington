import { activityPubInboxConfig } from '@services/ap-inbox-activities/config'
import { DATA_RETENTION_MAX_VALUES, dataRetentionConfig } from '@services/data-retention/config'
import { moderationAiConfig, moderationAiDispatchConfig } from '@services/moderation/ai-config'
import {
  RSS_FEED_CRAWL_MAX_VALUES,
  RSS_FEED_CRAWL_MIN_VALUES,
  rssFeedCrawlConfig,
} from '@services/rss-feeds/crawl-config'
import { rssFeedDiscoverabilityConfig } from '@services/rss-feeds/discoverability-config'
import {
  USER_IMPORT_EXPORT_MAX_VALUES,
  USER_IMPORT_EXPORT_MIN_VALUES,
  userImportExportConfig,
} from '@services/user-import-export/config'
import { webRiskConfig } from '@services/web-risk/config'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'
import { scoreField } from './registry-entry-utils.mts'
import { membershipBillingRegistryEntry } from './registry-membership-billing-entry.mts'
import { postRelatedUrlDisplayRegistryEntries } from './registry-post-related-url-entries.mts'
import { storyRelatedItemsRegistryEntry } from './registry-story-related-items-entry.mts'
import {
  validateRssFeedCrawlConfig,
  validateRssFeedDiscoverabilityConfig,
  validateUserImportExportConfig,
} from './registry-validators.mts'

export const operationalDynamicConfigRegistryEntries = [
  ...postRelatedUrlDisplayRegistryEntries,
  storyRelatedItemsRegistryEntry,
  membershipBillingRegistryEntry,
  defineDynamicConfigNamespace({
    namespace: 'activitypub-inbox',
    label: 'ActivityPub Inbox',
    description: 'Rollout control for durable asynchronous ActivityPub inbox delivery.',
    config: activityPubInboxConfig,
    access: { update_roles: ['developer'] },
    fields: {
      async_delivery_enabled: {
        description: 'Persist accepted inbox requests and deliver them through the I/O worker.',
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'rss-feed-discoverability-config',
    label: 'RSS Feed Discoverability',
    description: 'Thresholds for automatic RSS feed discoverability changes.',
    config: rssFeedDiscoverabilityConfig,
    access: { update_roles: ['developer'] },
    fields: {
      enabled: { description: 'Enable automatic RSS feed discoverability updates.' },
      make_discoverable_min_net_score: scoreField(
        'Net score threshold for making feeds discoverable.',
      ),
      make_discoverable_alt_min_net_score: scoreField(
        'Alternate lower net score threshold when subscriptions are high enough.',
      ),
      make_discoverable_min_subscriptions: {
        description: 'Subscription count required for the alternate discoverability threshold.',
        min_value: 0,
        max_value_exemption:
          'Subscription thresholds intentionally remain operator-tunable because feed popularity distribution changes over time.',
        integer: true,
      },
      make_undiscoverable_max_net_score: scoreField(
        'Net score threshold at or below which feeds become undiscoverable.',
      ),
    },
    validate: validateRssFeedDiscoverabilityConfig,
  }),
  defineDynamicConfigNamespace({
    namespace: 'rss-feed-crawl-config',
    label: 'RSS Feed Crawl',
    description: 'Tiered RSS feed crawl scheduling controls.',
    config: rssFeedCrawlConfig,
    access: { update_roles: ['developer'] },
    fields: {
      enabled: { description: 'Enable prioritized tiered RSS feed crawl scheduling.' },
      ignore_robots_txt: {
        description:
          'Ignore robots.txt allow/disallow rules for all RSS feed fetches. Operator kill-switch; hard-blocks (blocked/crawlable=FALSE/blacklists) still apply.',
      },
      tier1_sla_ms: rssFeedCrawlField('Tier 1 fetch SLA in milliseconds.', 'tier1_sla_ms'),
      tier2_sla_ms: rssFeedCrawlField('Tier 2 fetch SLA in milliseconds.', 'tier2_sla_ms'),
      tier3_sla_ms: rssFeedCrawlField('Tier 3 fetch SLA in milliseconds.', 'tier3_sla_ms'),
      tier4_sla_ms: rssFeedCrawlField('Tier 4 fetch SLA in milliseconds.', 'tier4_sla_ms'),
      tier5_sla_ms: rssFeedCrawlField('Tier 5 fetch SLA in milliseconds.', 'tier5_sla_ms'),
      capacity_budget: rssFeedCrawlField(
        'Maximum RSS feeds dispatched per scheduler run.',
        'capacity_budget',
      ),
    },
    validate: validateRssFeedCrawlConfig,
  }),
  defineDynamicConfigNamespace({
    namespace: 'user-import-export-config',
    label: 'User Import/Export',
    description: 'Runtime bounds for user data import and export workflows.',
    config: userImportExportConfig,
    access: { update_roles: ['developer'] },
    fields: {
      sync_export_max_items: {
        description: 'Maximum items allowed in synchronous RSS feed and topic exports.',
        min_value: USER_IMPORT_EXPORT_MIN_VALUES.sync_export_max_items,
        max_value: USER_IMPORT_EXPORT_MAX_VALUES.sync_export_max_items,
        integer: true,
      },
    },
    validate: validateUserImportExportConfig,
  }),
  defineDynamicConfigNamespace({
    namespace: 'data-retention-config',
    label: 'Data Retention',
    description: 'Per-run batch bounds for the daily data retention cleanup.',
    config: dataRetentionConfig,
    access: { update_roles: ['developer'] },
    fields: {
      topic_import_attempt_batch_size: {
        description: 'Topic import attempt rows per retention page.',
        min_value: 1,
        max_value: 250,
        integer: true,
      },
      batch_size: {
        description: 'Rows each data retention cleanup deletes per batch.',
        min_value: 1,
        max_value: DATA_RETENTION_MAX_VALUES.batch_size,
        integer: true,
      },
      max_batches_per_run: {
        description:
          'Maximum batches each data retention cleanup runs per daily job. A cleanup that hits the cap reports more work and resumes on the next run.',
        min_value: 1,
        max_value: DATA_RETENTION_MAX_VALUES.max_batches_per_run,
        integer: true,
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'web-risk-config',
    label: 'Web Risk',
    description: 'Google Web Risk lookup enablement for URL safety checks.',
    config: webRiskConfig,
    access: { update_roles: [] },
    fields: { enabled: { description: 'Call Google Web Risk for eligible public URL checks.' } },
  }),
  defineDynamicConfigNamespace({
    namespace: 'moderation-ai-config',
    label: 'Moderation AI',
    description: 'Controls for AI-powered moderation judgement agent features.',
    config: moderationAiConfig,
    access: { update_roles: ['moderator'] },
    fields: {
      community_judgement_enabled: {
        description: 'Enable AI report-judgement agent for community moderation reports.',
      },
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'moderation-ai-dispatch-config',
    label: 'Moderation AI Auto-Dispatch',
    description:
      'Controls for automatic dispatch of actions recommended by AI judgements. Requires developer access — these flags directly execute moderation actions.',
    config: moderationAiDispatchConfig,
    access: { update_roles: ['developer'] },
    fields: {
      auto_dispatch_enabled: {
        description:
          'Master switch for auto-dispatching recommended actions after AI judgements. All per-action flags are ignored when this is false.',
      },
      auto_dispatch_remove: {
        description:
          'When auto_dispatch_enabled, automatically execute remove actions recommended by AI judgements.',
      },
      auto_dispatch_warn: {
        description:
          'When auto_dispatch_enabled, automatically issue warnings recommended by AI judgements.',
      },
      auto_dispatch_no_action: {
        description:
          'When auto_dispatch_enabled, automatically dismiss reports where AI recommends no action.',
      },
    },
  }),
]

function rssFeedCrawlField(description: string, key: keyof typeof RSS_FEED_CRAWL_MIN_VALUES) {
  return {
    description,
    min_value: RSS_FEED_CRAWL_MIN_VALUES[key],
    max_value: RSS_FEED_CRAWL_MAX_VALUES[key],
    integer: true,
  }
}
