import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import {
  USER_DELETIONS_LOCK_DURATION_MS,
  USER_DELETIONS_QUEUE_NAME,
} from '@queues/user-deletions/config'
import { processUserDeletionJob } from './processors/process-job.mts'

export const userDeletions = createWorker(USER_DELETIONS_QUEUE_NAME, processUserDeletionJob, {
  concurrency: getWorkerConcurrency('userDeletions', { baseline: 2, ignoreScale: true }),
  lockDuration: USER_DELETIONS_LOCK_DURATION_MS,
  stalledInterval: 30_000,
})
