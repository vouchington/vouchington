import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import { PRIORITY_DEFAULT, QUEUE_NAME } from '../config.mts'
import { notifications } from '../queues.mts'

const FIVE_MINUTES_MS = 5 * 60 * 1000
const enqueueCheck = createEnqueueFunction<
  Record<string, never>,
  'processCheckCopyrightReviewTarget'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processCheckCopyrightReviewTarget',
})

export function enqueueCheckCopyrightReviewTarget(): EnqueueReturnType {
  return enqueueCheck(
    {},
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: PRIORITY_DEFAULT,
      deduplication: {
        id: 'copyright-review-target-page',
        mode: 'throttle',
        ttl: FIVE_MINUTES_MS,
      },
    },
  )
}
