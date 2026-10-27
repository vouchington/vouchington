import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import type { JobOptions } from 'glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import type {
  CommunityActivityDigestScheduleData,
  CommunityActivityDigestDispatchData,
} from '@queues/background/enqueues/notifications-domain'
import {
  NOTIFICATIONS_DIGEST_DISPATCH_JOB,
  NOTIFICATIONS_DIGEST_SCHEDULE_TICK_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import { notifications } from '../queues.mts'

export type { CommunityActivityDigestDispatchData }

const enqueueScheduleTickJob = createBackgroundEnqueue(NOTIFICATIONS_DIGEST_SCHEDULE_TICK_JOB)
const enqueueBulkWindowJobs = createBackgroundBulkEnqueue(
  NOTIFICATIONS_DIGEST_DISPATCH_JOB,
  (data: CommunityActivityDigestDispatchData) => ({
    data,
    opts: { jobId: communityActivityDigestWindowJobId(data) },
  }),
)

export function communityActivityDigestWindowJobId(data: CommunityActivityDigestDispatchData) {
  return `digest__${new Date(data.windowStart).getTime()}`
}

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

/** Re-admit a terminal window job after a crash; a live job already owns its window. */
export function enqueueCommunityActivityDigestWindows(
  windows: CommunityActivityDigestDispatchData[],
  options: { queue?: typeof notifications; retry?: Pick<JobOptions, 'attempts' | 'backoff'> } = {},
) {
  const queue = options.queue ?? notifications
  const enqueueBulk =
    options.queue || options.retry
      ? createBulkEnqueueFunction({
          queue,
          queueName: BACKGROUND_QUEUE_NAME,
          jobName: NOTIFICATIONS_DIGEST_DISPATCH_JOB.name,
          defaults: { ...NOTIFICATIONS_DIGEST_DISPATCH_JOB.options, ...options.retry },
          buildJob: (data: CommunityActivityDigestDispatchData) => ({
            data,
            opts: { jobId: communityActivityDigestWindowJobId(data) },
          }),
        })
      : enqueueBulkWindowJobs
  return enqueueBulkReactivatingFinished({
    queue,
    inputs: windows,
    jobIdOf: communityActivityDigestWindowJobId,
    enqueueBulk,
  })
}

export function enqueueCommunityActivityDigestScheduleTick(
  data: CommunityActivityDigestScheduleData = {},
): EnqueueReturnType {
  return enqueueScheduleTickJob(data)
}
