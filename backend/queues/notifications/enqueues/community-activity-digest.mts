import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import type {
  CommunityActivityDigestBatchData,
  CommunityActivityDigestDispatchData,
} from '@queues/background/enqueues/notifications-domain'
import {
  NOTIFICATIONS_DIGEST_BATCH_JOB,
  NOTIFICATIONS_DIGEST_DISPATCH_JOB,
  NOTIFICATIONS_DIGEST_SCHEDULE_TICK_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { notifications } from '../queues.mts'
import { COMMUNITY_ACTIVITY_DIGEST_INACTIVITY_TIMEOUT_MS } from '@voucha/types/community-activity-digest'

const FIVE_MINUTES_MS = 5 * 60 * 1000

export type { CommunityActivityDigestBatchData, CommunityActivityDigestDispatchData }

const enqueueDispatchJob = createBackgroundEnqueue(NOTIFICATIONS_DIGEST_DISPATCH_JOB)
const enqueueScheduleTickJob = createBackgroundEnqueue(NOTIFICATIONS_DIGEST_SCHEDULE_TICK_JOB)
const enqueueBatchJob = createBackgroundEnqueue(NOTIFICATIONS_DIGEST_BATCH_JOB)

export function getCommunityActivityDigestDispatchData(
  now = new Date(),
): Pick<CommunityActivityDigestDispatchData, 'windowStart' | 'windowEnd'> {
  const end = new Date(now)
  end.setUTCHours(0, 0, 0, 0)
  end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 6) % 7))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 7)
  return { windowStart: start.toISOString(), windowEnd: end.toISOString() }
}

export function enqueueCommunityActivityDigestDispatch(
  data: CommunityActivityDigestDispatchData,
  options: { queue?: typeof notifications } = {},
): EnqueueReturnType {
  const enqueue = options.queue
    ? createEnqueueFunction<CommunityActivityDigestDispatchData, string>({
        queue: options.queue,
        queueName: BACKGROUND_QUEUE_NAME,
        jobName: NOTIFICATIONS_DIGEST_DISPATCH_JOB.name,
        defaults: NOTIFICATIONS_DIGEST_DISPATCH_JOB.options,
      })
    : enqueueDispatchJob
  return enqueue(data, {
    deduplication: {
      id: `processCommunityActivityDigestDispatch__${data.windowStart}__${data.leaseToken}`,
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueCommunityActivityDigestScheduleTick(): EnqueueReturnType {
  return enqueueScheduleTickJob({})
}

export function enqueueCommunityActivityDigestBatch(
  data: CommunityActivityDigestBatchData,
): EnqueueReturnType {
  return enqueueBatchJob(data, {
    deduplication: {
      id: `processCommunityActivityDigestBatch__${data.windowStart}__${data.leaseToken}__${data.afterUserId ?? 'start'}`,
      mode: 'throttle',
      ttl: COMMUNITY_ACTIVITY_DIGEST_INACTIVITY_TIMEOUT_MS,
    },
  } satisfies Partial<JobOptions>)
}
