import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import { QUEUE_NAME } from '@queues/notifications/config'
import type { NotificationJobs } from '@queues/notifications/types'
import * as processors from './processors.mts'
import { processCommunityActivityDigestScheduleTick } from './processors/community-activity-digest-schedule.mts'

export const notificationsWorker = createWorker(
  QUEUE_NAME,
  (job: Job) => {
    if (job.name === 'processCommunityActivityDigestScheduleTick') {
      return processCommunityActivityDigestScheduleTick({})
    }
    const fn =
      processors[
        job.name as Exclude<NotificationJobs, 'processCommunityActivityDigestScheduleTick'>
      ]
    if (!fn || typeof fn !== 'function') throw new Error(`Notifications job ${job.name} not found`)
    return (fn as (data: never) => Promise<unknown>)(job.data as never)
  },
  {
    concurrency: getWorkerConcurrency('notifications', { baseline: 5 }),
  },
)
