import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
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
const BEDROCK_SINGLE = new Set([
  'bedrock-embeddings.topic',
  'bedrock-embeddings.post',
  'bedrock-embeddings.rss_feed_item',
])
const BEDROCK_CREATION = new Map<string, BatchJobType>([
  ['bedrock-embeddings.create_topics', 'topics'],
  ['bedrock-embeddings.create_posts', 'posts'],
  ['bedrock-embeddings.create_rss_feed_items', 'rss_feed_items'],
  ['bedrock-embeddings.create_crawl_chunks', 'crawl_chunks'],
  ['bedrock-embeddings.create_images', 'images'],
])
const BEDROCK_BATCH = new Set([
  'bedrock-embeddings.poll_batch',
  'bedrock-embeddings.poll_dispatcher',
  'bedrock-embeddings.creation_dispatcher',
  'bedrock-embeddings.backlog_dispatcher',
  'bedrock-embeddings.stale_cleanup_dispatcher',
  'bedrock-embeddings.reconcile_existing',
  'bedrock-embeddings.post_trigger_recovery',
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
  if (name === 'crawl.crawl_url') return 'crawler'
  if (CRAWL_DISPATCH.has(name)) return 'crawl-dispatch'
  if (CRAWL_REFERRAL.has(name)) return 'crawl-referral'
  if (CRAWL_UNFURL.has(name)) return 'crawl-unfurl'
  if (BEDROCK_SINGLE.has(name)) return 'bedrock-single'
  if (BEDROCK_CREATION.has(name)) return 'bedrock-creation'
  if (BEDROCK_BATCH.has(name)) return 'bedrock-batch'
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

export function getBedrockCreationType(name: string): BatchJobType | undefined {
  return BEDROCK_CREATION.get(name)
}
