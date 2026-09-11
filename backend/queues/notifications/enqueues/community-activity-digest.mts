import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, QUEUE_NAME } from '../config.mts'
import { notifications } from '../queues.mts'
import { COMMUNITY_ACTIVITY_DIGEST_INACTIVITY_TIMEOUT_MS } from '@voucha/types/community-activity-digest'

const FIVE_MINUTES_MS = 5 * 60 * 1000

export type CommunityActivityDigestBatchData = {
  windowStart: string
  windowEnd: string
  afterUserId?: string
}

export type CommunityActivityDigestDispatchData = {
  windowStart: string
  windowEnd: string
}

const enqueueDispatchJob = createEnqueueFunction<
  CommunityActivityDigestDispatchData,
  'processCommunityActivityDigestDispatch'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processCommunityActivityDigestDispatch',
})
const enqueueScheduleTickJob = createEnqueueFunction<
  Record<string, never>,
  'processCommunityActivityDigestScheduleTick'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processCommunityActivityDigestScheduleTick',
})

const enqueueBatchJob = createEnqueueFunction<
  CommunityActivityDigestBatchData,
  'processCommunityActivityDigestBatch'
>({ queue: notifications, queueName: QUEUE_NAME, jobName: 'processCommunityActivityDigestBatch' })

export function getCommunityActivityDigestDispatchData(
  now = new Date(),
): CommunityActivityDigestDispatchData {
  const end = new Date(now)
  end.setUTCHours(0, 0, 0, 0)
  end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 6) % 7))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 7)
  return { windowStart: start.toISOString(), windowEnd: end.toISOString() }
}

export function enqueueCommunityActivityDigestDispatch(
  data = getCommunityActivityDigestDispatchData(),
): EnqueueReturnType {
  return enqueueDispatchJob(data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: `processCommunityActivityDigestDispatch__${data.windowStart}`,
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueCommunityActivityDigestScheduleTick(): EnqueueReturnType {
  return enqueueScheduleTickJob({}, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
    priority: PRIORITY_DEFAULT,
  } satisfies Partial<JobOptions>)
}

export function enqueueCommunityActivityDigestBatch(
  data: CommunityActivityDigestBatchData,
): EnqueueReturnType {
  return enqueueBatchJob(data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: `processCommunityActivityDigestBatch__${data.windowStart}__${data.afterUserId ?? 'start'}`,
      mode: 'throttle',
      ttl: COMMUNITY_ACTIVITY_DIGEST_INACTIVITY_TIMEOUT_MS,
    },
  } satisfies Partial<JobOptions>)
}
