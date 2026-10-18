import { backgroundHandler } from '@queues/background-cpu/enqueues/define-handler'
import { BACKGROUND_CPU_JOBS } from '@queues/background-cpu/enqueues/registry'
import type { BackgroundCpuHandler } from '@queues/background-cpu/types'
import { processCrawlerJob } from '@workers/crawler/processors'
import { processCrawlDispatchJob } from '@workers/crawl-dispatch/processors'
import { processCrawlReferralLinksJob } from '@workers/crawl-referral-links/processors'
import { processUnfurlReferralLinksJob } from '@workers/unfurl-referral-links/processors'
import { processBedrockNovaMultimodalV1SingleJob } from '@workers/bedrock-embeddings/processors/nova-multimodal-v1-single'
import { processEmbeddingCreationJob } from '@workers/bedrock-embeddings-batch/processors/creation'
import { processBedrockEmbeddingsBatchJob } from '@workers/bedrock-embeddings-batch/processors/worker-router'
import { processSpendCapRecheckJob } from '@workers/ai-agents/processors/spend-cap-recheck'
import {
  processLanguageDetection,
  processLanguageDetectionBackfill,
} from '@workers/content-analysis/processors'
import { processStaydownHash } from '@workers/content-analysis/processors/staydown-hash'
import { cleanupAbandonedUploads } from '@services/images/cleanup-abandoned-uploads'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import type {
  LanguageDetectionBackfillJobName,
  LanguageDetectionEntityType,
} from '@queues/content-analysis/types'
import type { Job } from 'glide-mq'
import { withBedrockRateLimit } from './bedrock-rate.mts'
import { processRetainedSweep } from '@data-stores/valkey-glide-mq'

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
function resolveCpuJobRoute(name: string): string | undefined {
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

async function runCpuJob(job: Job): Promise<unknown> {
  const route = resolveCpuJobRoute(job.name)
  if (route === 'crawler') return processCrawlerJob(job)
  if (route === 'crawl-dispatch') return processCrawlDispatchJob(job)
  if (route === 'crawl-referral') return processCrawlReferralLinksJob(job)
  if (route === 'crawl-unfurl') return processUnfurlReferralLinksJob(job)
  if (route === 'bedrock-single')
    return withBedrockRateLimit(() => processBedrockNovaMultimodalV1SingleJob(job))
  const creationType = BEDROCK_CREATION.get(job.name)
  if (route === 'bedrock-creation' && creationType)
    return withBedrockRateLimit(() => processEmbeddingCreationJob(job, creationType))
  if (route === 'bedrock-batch')
    return withBedrockRateLimit(() => processBedrockEmbeddingsBatchJob(job))
  if (route === 'spend-cap') return processSpendCapRecheckJob(job)
  if (route === 'upload-cleanup') return cleanupAbandonedUploads()
  if (route === 'staydown-hash') {
    const id = job.data?.id
    if (typeof id !== 'string') throw new Error('Staydown hash job requires id')
    await processStaydownHash(id)
    return { success: true }
  }
  if (route === 'language-backfill' || route === 'language-detection') {
    const localName = job.name.slice('content-analysis.'.length)
    if (LANGUAGE_BACKFILL.has(localName))
      return processRetainedSweep(job, save =>
        processLanguageDetectionBackfill(
          localName as LanguageDetectionBackfillJobName,
          undefined,
          typeof job.data?.cursor === 'string' ? job.data.cursor : undefined,
          cursor => save({ cursor }),
        ),
      )
    if (LANGUAGE_DETECTION.has(localName)) {
      const id = job.data?.id
      if (typeof id !== 'string') throw new Error('Language detection job requires id')
      await processLanguageDetection(localName as LanguageDetectionEntityType, id)
      return { success: true }
    }
  }
  throw new Error(`No CPU handler for ${job.name}`)
}

/** Every registered name must resolve before the shared worker starts. */
export const BACKGROUND_CPU_HANDLERS: readonly BackgroundCpuHandler[] = BACKGROUND_CPU_JOBS.map(
  job => {
    if (!resolveCpuJobRoute(job.name)) throw new Error(`No CPU handler for ${job.name}`)
    return backgroundHandler(job, runCpuJob)
  },
)
