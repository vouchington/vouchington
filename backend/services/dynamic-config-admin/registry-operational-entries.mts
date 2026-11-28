import { moderationDiagnosticsRegistryEntries } from './registry-moderation-diagnostics-entries.mts'
import { hackerNewsReferenceRegistryEntry } from './registry-hacker-news-reference-entry.mts'
import {
  hackerNewsVisibilityConfig,
  HACKER_NEWS_POST_TIME_RANGES,
} from '@services/urls/hacker-news-visibility-config'
import { listImportRegistryEntry } from './registry-list-import-entry.mts'
import { moderationAiConfig, moderationAiDispatchConfig } from '@services/moderation-ai-config'
import {
  RSS_FEED_CRAWL_MAX_VALUES,
  RSS_FEED_CRAWL_MIN_VALUES,
  rssFeedCrawlConfig,
} from '@services/rss-feeds/crawl-config'
import { rssFeedDiscoverabilityConfig } from '@services/rss-feeds/discoverability-config'
import { webRiskConfig } from '@services/web-risk/config'
import {
  defineDynamicConfigNamespace,
  DynamicConfigValidationError,
} from 'valkyries/dynamic-config'
import { scoreField } from './registry-entry-utils.mts'
import { activityPubInboxRegistryEntry } from './registry-activitypub-entry.mts'
import { membershipBillingRegistryEntry } from './registry-membership-billing-entry.mts'
import { moderationExposureRegistryEntry } from './registry-moderation-exposure-entry.mts'
import { commentPlaceholderRegistryEntry } from './registry-comment-placeholder-entry.mts'
import { dataRetentionRegistryEntry } from './registry-data-retention-entry.mts'
import { postRelatedUrlDisplayRegistryEntries } from './registry-post-related-url-entries.mts'
import { storyRelatedItemsRegistryEntry } from './registry-story-related-items-entry.mts'
import { userImportExportRegistryEntry } from './registry-user-import-export-entry.mts'
import {
  validateRssFeedCrawlConfig,
  validateRssFeedDiscoverabilityConfig,
} from './product-config-validators.mts'

export const operationalDynamicConfigRegistryEntries = [
  ...moderationDiagnosticsRegistryEntries,
  hackerNewsReferenceRegistryEntry,
  defineDynamicConfigNamespace({
    namespace: 'hacker-news-visibility-config',
    label: 'Hacker News visibility',
    description: 'Controls display and filtering of Hacker News references.',
    config: hackerNewsVisibilityConfig,
    access: { update_roles: [] },
    fields: {
      references_visible: { description: 'Show and filter Hacker News references.' },
      post_time_range_cap: { description: 'Widest post search range: 1w, 1m, 1y, or all.' },
    },
    validate: next => {
      if (!HACKER_NEWS_POST_TIME_RANGES.some(range => range === next.post_time_range_cap)) {
        throw new DynamicConfigValidationError('post_time_range_cap: must be 1w|1m|1y|all')
      }
    },
  }),
  listImportRegistryEntry,
  ...postRelatedUrlDisplayRegistryEntries,
  storyRelatedItemsRegistryEntry,
  membershipBillingRegistryEntry,
  userImportExportRegistryEntry,
  activityPubInboxRegistryEntry,
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
        minValue: 0,
        maxValue: 1_000_000,
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
      should_ignore_robots_txt: {
        description:
          'Ignore robots.txt allow/disallow rules for all RSS feed fetches. Operator kill-switch; hard-blocks (blocked/crawlable=FALSE/blacklists) still apply.',
      },
      tier1_sla_ms: rssFeedCrawlField('Tier 1 fetch SLA in milliseconds.', 'tier1_sla_ms'),
      tier2_sla_ms: rssFeedCrawlField('Tier 2 fetch SLA in milliseconds.', 'tier2_sla_ms'),
      tier3_sla_ms: rssFeedCrawlField('Tier 3 fetch SLA in milliseconds.', 'tier3_sla_ms'),
      tier4_sla_ms: rssFeedCrawlField('Tier 4 fetch SLA in milliseconds.', 'tier4_sla_ms'),
      tier5_sla_ms: rssFeedCrawlField('Tier 5 fetch SLA in milliseconds.', 'tier5_sla_ms'),
      retry_interval_ms: rssFeedCrawlField(
        'Wait time in milliseconds before retrying a failed or skipped RSS feed.',
        'retry_interval_ms',
      ),
      capacity_budget: rssFeedCrawlField(
        'Maximum RSS feeds dispatched per scheduler run.',
        'capacity_budget',
      ),
    },
    validate: validateRssFeedCrawlConfig,
  }),
  dataRetentionRegistryEntry,
  commentPlaceholderRegistryEntry,
  moderationExposureRegistryEntry,
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
    minValue: RSS_FEED_CRAWL_MIN_VALUES[key],
    maxValue: RSS_FEED_CRAWL_MAX_VALUES[key],
    integer: true,
  }
}
