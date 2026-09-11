import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { LANGUAGE_DETECTION_QUEUE_NAME } from '@queues/language-detection/config'
import type {
  LanguageDetectionBackfillJobName,
  LanguageDetectionEntityType,
} from '@queues/language-detection/types'
import type { Job } from 'glide-mq'
import { processLanguageDetection, processLanguageDetectionBackfill } from './processors.mts'

type LanguageDetectionJobData = { id?: string }

const BACKFILL_JOBS = new Set<string>([
  'backfill_posts',
  'backfill_rss_feed_items',
  'backfill_crawls',
  'backfill_communities',
  'backfill_users',
  'backfill_topics',
])

export const languageDetection = createWorker(
  LANGUAGE_DETECTION_QUEUE_NAME,
  async (job: Job<LanguageDetectionJobData>) => {
    if (BACKFILL_JOBS.has(job.name)) {
      return processLanguageDetectionBackfill(job.name as LanguageDetectionBackfillJobName)
    }
    if (!job.data.id) throw new Error('Language detection job requires id in job.data')
    await processLanguageDetection(job.name as LanguageDetectionEntityType, job.data.id)
    return { success: true }
  },
  { concurrency: getWorkerConcurrency('languageDetection', { baseline: 5 }) },
)
