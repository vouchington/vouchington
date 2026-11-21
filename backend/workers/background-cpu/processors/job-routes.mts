import { isRetainedBedrockJob } from './bedrock-retained-handlers.mts'
import type { BatchJobType } from '@services/embeddings/batch/types'
import type { CpuJob, LanguageBackfillJob, LanguageDetectionJob } from './job-types.mts'

const CRAWL_DISPATCH = new Set([
  'crawl.enqueueCrawlHostnamesDispatcher',
  'crawl.enqueueCrawlTier1Dispatcher',
  'crawl.enqueueCrawlTier2Dispatcher',
  'crawl.crawl_hostnames_dispatcher',
  'crawl.crawl_urls_per_hostname_dispatcher',
  'crawl.crawl_tier1_dispatcher',
  'crawl.crawl_tier2_dispatcher',
  'crawl.refresh_hostname_crawler_dispatcher',
  'crawl.refresh_hostname_crawler',
  'crawl.crawl_cleanup',
  'crawl.boilerplate_removal_dispatcher',
  'crawl.boilerplate_removal',
])
const CRAWL_REFERRAL = new Set([
  'crawl.crawl_referral_link',
  'crawl.crawl_referral_links_dispatcher',
  'crawl.enqueueCrawlReferralLinksDispatcher',
])
const CRAWL_UNFURL = new Set([
  'crawl.unfurl_referral_link',
  'crawl.unfurl_referral_links_dispatcher',
  'crawl.enqueueUnfurlReferralLinksDispatcher',
  'crawl.remove_unfurled_children_for_user',
])
const GEMINI_SINGLE = new Set([
  'gemini-embeddings.topic',
  'gemini-embeddings.post',
  'gemini-embeddings.rss_feed_item',
])
const GEMINI_CREATION = new Map<string, BatchJobType>([
  ['gemini-embeddings.create_topics', 'topics'],
  ['gemini-embeddings.create_posts', 'posts'],
  ['gemini-embeddings.create_rss_feed_items', 'rss_feed_items'],
  ['gemini-embeddings.create_crawl_chunks', 'crawl_chunks'],
  ['gemini-embeddings.create_images', 'images'],
])
const GEMINI_BATCH = new Set([
  'gemini-embeddings.poll_batch',
  'gemini-embeddings.poll_dispatcher',
  'gemini-embeddings.creation_dispatcher',
  'gemini-embeddings.backlog_dispatcher',
  'gemini-embeddings.stale_cleanup_dispatcher',
  'gemini-embeddings.reconcile_existing',
  'gemini-embeddings.post_trigger_recovery',
])
const LANGUAGE_DETECTION = new Set(['post', 'rss_feed_item', 'crawl', 'community', 'user', 'topic'])
const LANGUAGE_BACKFILL = new Set([
  'backfill_posts',
  'backfill_rss_feed_items',
  'backfill_crawls',
  'backfill_communities',
  'backfill_users',
  'backfill_topics',
])

/** Selects the production runner before reading a job payload. */
export function resolveCpuJobRoute(name: string): string | undefined {
  if (isRetainedBedrockJob(name)) return 'retained-bedrock'
  if (name === 'crawl.crawl_url') return 'crawler'
  if (CRAWL_DISPATCH.has(name)) return 'crawl-dispatch'
  if (CRAWL_REFERRAL.has(name)) return 'crawl-referral'
  if (CRAWL_UNFURL.has(name)) return 'crawl-unfurl'
  if (GEMINI_SINGLE.has(name)) return 'gemini-single'
  if (GEMINI_CREATION.has(name)) return 'gemini-creation'
  if (GEMINI_BATCH.has(name)) return 'gemini-batch'
  if (name === 'ai-spend-cap.recheck') return 'spend-cap'
  if (name === 'content-analysis.cleanup-abandoned-uploads') return 'upload-cleanup'
  if (name === 'content-analysis.staydown-hash') return 'staydown-hash'
  if (name.startsWith('content-analysis.')) {
    const localName = name.slice('content-analysis.'.length)
    if (LANGUAGE_BACKFILL.has(localName)) return 'language-backfill'
    if (LANGUAGE_DETECTION.has(localName)) return 'language-detection'
  }
  return undefined
}

export function isLanguageBackfillJob(job: CpuJob): job is LanguageBackfillJob {
  return (
    job.name.startsWith('content-analysis.') &&
    LANGUAGE_BACKFILL.has(job.name.slice('content-analysis.'.length))
  )
}

export function isLanguageDetectionJob(job: CpuJob): job is LanguageDetectionJob {
  return (
    job.name.startsWith('content-analysis.') &&
    LANGUAGE_DETECTION.has(job.name.slice('content-analysis.'.length))
  )
}

export function getGeminiCreationType(name: string): BatchJobType | undefined {
  return GEMINI_CREATION.get(name)
}
