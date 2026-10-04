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
  defineBoundedWorkNamespace(aiUsageWorkConfig, 'AI usage', aiUsageWorkMaxValues, {
    release_batch_size: 'Release batch size for ai usage processing.',
  }),
  defineBoundedWorkNamespace(
    blueskyFollowsWorkConfig,
    'Bluesky Follows',
    blueskyFollowsWorkMaxValues,
    {
      backfill_batch_size: 'Backfill batch size for bluesky follows processing.',
    },
  ),
  defineBoundedWorkNamespace(crawlEmbedsWorkConfig, 'Crawl Embeds', crawlEmbedsWorkMaxValues, {
    backfill_batch_size: 'Backfill batch size for crawl embeds processing.',
  }),
  defineBoundedWorkNamespace(
    languageDetectionWorkConfig,
    'Language Detection',
    languageDetectionWorkMaxValues,
    {
      backfill_batch_size: 'Backfill batch size for language detection processing.',
    },
  ),
  defineBoundedWorkNamespace(
    reportIntegrityWorkConfig,
    'Report Integrity',
    reportIntegrityWorkMaxValues,
    {
      backfill_batch_size: 'Backfill batch size for report integrity processing.',
    },
  ),
]
