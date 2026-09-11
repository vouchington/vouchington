import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/activitypub-inbox/config'
import type {
  ActivityPubInboxDeliveryJob,
  ActivityPubInboxJobs,
} from '@queues/activitypub-inbox/types'
import type { Job } from 'glide-mq'
import {
  cleanupExpiredDeliveries,
  processDelivery,
  rearmFailedDeliveries,
  recoverDeliveries,
} from './processors.mts'

const activityPubInboxJobProcessors = {
  processDelivery,
  recoverDeliveries,
  rearmFailedDeliveries,
  cleanupExpiredDeliveries,
}

export type ActivityPubInboxJobProcessors = typeof activityPubInboxJobProcessors

export function processActivityPubInboxJob(
  job: Job<ActivityPubInboxDeliveryJob | Record<string, never>>,
  processors: ActivityPubInboxJobProcessors = activityPubInboxJobProcessors,
) {
  switch (job.name as ActivityPubInboxJobs) {
    case 'processDelivery':
      return processors.processDelivery(job.data as ActivityPubInboxDeliveryJob, {
        isFinalAttempt: isFinalActivityPubInboxAttempt(job),
      })
    case 'recoverDeliveries':
      return processors.recoverDeliveries()
    case 'rearmFailedDeliveries':
      return processors.rearmFailedDeliveries()
    case 'cleanupExpiredDeliveries':
      return processors.cleanupExpiredDeliveries()
    default:
      throw new Error(`Unknown ActivityPub inbox job: ${job.name}`)
  }
}

export const activitypubInboxWorker = createWorker(QUEUE_NAME, processActivityPubInboxJob, {
  concurrency: getWorkerConcurrency('activitypubInbox', { baseline: 5 }),
})

export function isFinalActivityPubInboxAttempt(job: Pick<Job, 'attemptsMade' | 'opts'>): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
}
