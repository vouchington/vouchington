import { backgroundHandler } from '@queues/background-cpu/enqueues/define-handler'
import { BACKGROUND_CPU_JOBS } from '@queues/background-cpu/enqueues/registry'
import type { BackgroundCpuHandler } from '@queues/background-cpu/types'
import type {
  LanguageDetectionBackfillJobName,
  LanguageDetectionEntityType,
} from '@queues/content-analysis/types'
import type { Job } from 'glide-mq'
import { withVertexRateLimit } from './vertex-rate.mts'
import { processRetainedSweep } from '@data-stores/valkey-glide-mq'
import { processUploadCleanupJob } from './upload-cleanup.mts'
import type { CpuJob } from './job-types.mts'
import {
  getGeminiCreationType,
  isLanguageBackfillJob,
  isLanguageDetectionJob,
  resolveCpuJobRoute,
} from './job-routes.mts'

async function runCpuJob(rawJob: Job<unknown>): Promise<unknown> {
  // The registry and route guard are the deserialization boundary for the shared queue.
  const job = rawJob as CpuJob
  const route = resolveCpuJobRoute(job.name)
  if (route === 'crawler' && job.name === 'crawl.crawl_url') {
    const { processCrawlerJob } = await import('@workers/crawler/processors')
    return processCrawlerJob(job)
  }
  if (route === 'crawl-dispatch') {
    const { processCrawlDispatchJob } = await import('@workers/crawl-dispatch/processors')
    return processCrawlDispatchJob(job)
  }
  if (route === 'crawl-referral') {
    const { processCrawlReferralLinksJob } =
      await import('@workers/crawl-referral-links/processors')
    return processCrawlReferralLinksJob(job)
  }
  if (route === 'crawl-unfurl') {
    const { processUnfurlReferralLinksJob } =
      await import('@workers/unfurl-referral-links/processors')
    return processUnfurlReferralLinksJob(job)
  }
  if (
    route === 'gemini-single' &&
    (job.name === 'gemini-embeddings.topic' ||
      job.name === 'gemini-embeddings.post' ||
      job.name === 'gemini-embeddings.rss_feed_item')
  )
    return withVertexRateLimit(async () => {
      const { processGeminiEmbedding2SingleJob } =
        await import('@workers/gemini-embeddings/processors/gemini-embedding-2-single')
      return processGeminiEmbedding2SingleJob(job)
    })
  const creationType = getGeminiCreationType(job.name)
  if (route === 'gemini-creation' && creationType)
    return withVertexRateLimit(async () => {
      const { processEmbeddingCreationJob } =
        await import('@workers/gemini-embeddings-batch/processors/creation')
      return processEmbeddingCreationJob(job, creationType)
    })
  if (route === 'gemini-batch')
    return withVertexRateLimit(async () => {
      const { processEmbeddingsBatchJob } =
        await import('@workers/gemini-embeddings-batch/processors/worker-router')
      return processEmbeddingsBatchJob(job)
    })
  if (route === 'spend-cap' && job.name === 'ai-spend-cap.recheck') {
    const { processSpendCapRecheckJob } =
      await import('@workers/ai-agents/processors/spend-cap-recheck')
    return processSpendCapRecheckJob(job)
  }
  if (route === 'upload-cleanup' && job.name === 'content-analysis.cleanup-abandoned-uploads')
    return processUploadCleanupJob(job)
  if (route === 'staydown-hash' && job.name === 'content-analysis.staydown-hash') {
    const id = job.data?.id
    if (typeof id !== 'string') throw new Error('Staydown hash job requires id')
    const { processStaydownHash } =
      await import('@workers/content-analysis/processors/staydown-hash')
    await processStaydownHash(id)
    return { success: true }
  }
  if (route === 'language-backfill' || route === 'language-detection') {
    const localName = job.name.slice('content-analysis.'.length)
    if (isLanguageBackfillJob(job))
      return processRetainedSweep(job, async save => {
        const { processLanguageDetectionBackfill } =
          await import('@workers/content-analysis/processors')
        return processLanguageDetectionBackfill(
          localName as LanguageDetectionBackfillJobName,
          undefined,
          job.data?.cursor,
          cursor => save({ cursor }),
        )
      })
    if (isLanguageDetectionJob(job)) {
      const id = job.data?.id
      if (typeof id !== 'string') throw new Error('Language detection job requires id')
      const { processLanguageDetection } = await import('@workers/content-analysis/processors')
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
