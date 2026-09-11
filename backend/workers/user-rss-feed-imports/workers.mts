import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME, USER_RSS_FEED_IMPORTS_DEFAULTS } from '@queues/user-rss-feed-imports/config'
import type {
  UserRssFeedImportJobs,
  UserRssFeedImportRowJob,
} from '@queues/user-rss-feed-imports/types'
import { processRssFeedImportRow } from '@services/user-import-export/rss-feed-imports'
import type { Job } from 'glide-mq'

export const userRssFeedImports = createWorker(
  QUEUE_NAME,
  (job: Job<UserRssFeedImportRowJob>) => {
    switch (job.name as UserRssFeedImportJobs) {
      case 'processImportRow': {
        const { importId, rowId } = job.data
        if (!importId) throw new Error('User RSS feed import job .importId is required')
        if (!rowId) throw new Error('User RSS feed import job .rowId is required')
        const maxAttempts = USER_RSS_FEED_IMPORTS_DEFAULTS.attempts
        const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts
        return processRssFeedImportRow(importId, rowId, { isFinalAttempt })
      }
      default:
        throw new Error(`Unknown user RSS feed import job: ${job.name}`)
    }
  },
  {
    concurrency: getWorkerConcurrency('userRssFeedImports', { baseline: 5 }),
    lockDuration: 120_000,
  },
)
