import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import { aiUsageWorkConfig, aiUsageWorkMaxValues } from '@services/ai-usage/work-limits'
import {
  blueskyFollowsWorkConfig,
  blueskyFollowsWorkMaxValues,
} from '@services/bluesky-follows/work-limits'
import { crawlEmbedsWorkConfig, crawlEmbedsWorkMaxValues } from '@services/crawl-embeds/work-limits'
import {
  languageDetectionWorkConfig,
  languageDetectionWorkMaxValues,
} from '@services/language-detection/work-limits'
import {
  reportIntegrityWorkConfig,
  reportIntegrityWorkMaxValues,
} from '@services/report-integrity/work-limits'

export const backgroundWorkEntries1 = [
  defineBoundedWorkNamespace({
    namespace: 'ai-usage-work-config',
    config: aiUsageWorkConfig,
    label: 'AI usage',
    maxValues: aiUsageWorkMaxValues,
    descriptions: {
      release_batch_size: 'Release batch size for ai usage processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'bluesky-follows-work-config',
    config: blueskyFollowsWorkConfig,
    label: 'Bluesky Follows',
    maxValues: blueskyFollowsWorkMaxValues,
    descriptions: {
      backfill_batch_size: 'Backfill batch size for bluesky follows processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'crawl-embeds-work-config',
    config: crawlEmbedsWorkConfig,
    label: 'Crawl Embeds',
    maxValues: crawlEmbedsWorkMaxValues,
    descriptions: {
      backfill_batch_size: 'Backfill batch size for crawl embeds processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'language-detection-work-config',
    config: languageDetectionWorkConfig,
    label: 'Language Detection',
    maxValues: languageDetectionWorkMaxValues,
    descriptions: {
      backfill_batch_size: 'Backfill batch size for language detection processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'report-integrity-work-config',
    config: reportIntegrityWorkConfig,
    label: 'Report Integrity',
    maxValues: reportIntegrityWorkMaxValues,
    descriptions: {
      backfill_batch_size: 'Backfill batch size for report integrity processing.',
    },
  }),
]
