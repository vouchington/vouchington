import { createWorker, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { CONTENT_ANALYSIS_QUEUE_NAME } from '@queues/content-analysis/config'
import type {
  LanguageDetectionBackfillJobName,
  LanguageDetectionEntityType,
} from '@queues/content-analysis/types'
import type { Job } from 'glide-mq'
import { processLanguageDetection, processLanguageDetectionBackfill } from './processors.mts'
import { cleanupAbandonedUploads } from '@services/images/cleanup-abandoned-uploads'
import { processStaydownHash, type ProcessStaydownHashDeps } from './processors/staydown-hash.mts'

type ContentAnalysisJobData = { id?: string }

const BACKFILL_JOBS = new Set<string>([
  'backfill_posts',
  'backfill_rss_feed_items',
  'backfill_crawls',
  'backfill_communities',
  'backfill_users',
  'backfill_topics',
])

export function createContentAnalysisWorker(
  prefix = workerQueuePrefix,
  staydownDeps: Partial<Pick<ProcessStaydownHashDeps, 'getImageFromS3'>> = {},
) {
  return createWorker(
    CONTENT_ANALYSIS_QUEUE_NAME,
    async (job: Job<ContentAnalysisJobData>) => {
      if (job.name === 'cleanup-abandoned-uploads') return cleanupAbandonedUploads()
      if (job.name === 'staydown-hash') {
        if (!job.data.id) throw new Error('Staydown hash job requires id')
        await processStaydownHash(job.data.id, staydownDeps)
        return { success: true }
      }
      if (BACKFILL_JOBS.has(job.name)) {
        return processLanguageDetectionBackfill(job.name as LanguageDetectionBackfillJobName)
      }
      if (!job.data.id) throw new Error('Language detection job requires id in job.data')
      await processLanguageDetection(job.name as LanguageDetectionEntityType, job.data.id)
      return { success: true }
    },
    {
      prefix,
      concurrency: getWorkerConcurrency('contentAnalysis', { baseline: 10 }),
      lockDuration: 120_000,
    },
  )
}

export const contentAnalysis = createContentAnalysisWorker()
