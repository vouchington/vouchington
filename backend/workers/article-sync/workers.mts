import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import { QUEUE_NAME } from '@queues/article-sync/config'
import type { ArticleSyncJobs } from '@queues/article-sync/types'
import { processArticleSync } from './processors.mts'

type ArticleSyncData = { userId?: string }

export const articleSyncWorker = createWorker(
  QUEUE_NAME,
  (job: Job<ArticleSyncData>) => {
    const name = job.name as ArticleSyncJobs
    if (name === 'processArticleSync') {
      const { userId } = job.data
      if (!userId) throw new Error('Article sync job missing userId')
      return processArticleSync(userId, job.id)
    }
    throw new Error(`Unknown article sync job: ${job.name}`)
  },
  { concurrency: getWorkerConcurrency('articleSync', { baseline: 1, ignoreScale: true }) },
)
