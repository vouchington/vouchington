import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { NOTIFICATIONS_CHECK_COPYRIGHT_REVIEW_TARGET_JOB } from '@queues/background/enqueues/notifications-jobs'
import type { EnqueueReturnType } from '@voucha/types'

const FIVE_MINUTES_MS = 5 * 60 * 1000
const enqueueCheck = createBackgroundEnqueue(NOTIFICATIONS_CHECK_COPYRIGHT_REVIEW_TARGET_JOB)

export function enqueueCheckCopyrightReviewTarget(): EnqueueReturnType {
  return enqueueCheck(
    {},
    {
      deduplication: {
        id: 'copyright-review-target-page',
        mode: 'throttle',
        ttl: FIVE_MINUTES_MS,
      },
    },
  )
}
