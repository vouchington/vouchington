import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { NOTIFICATIONS_ADMIT_COPYRIGHT_CASE_PURGE_JOB } from '@queues/background/enqueues/notifications-jobs'
import type { EnqueueReturnType } from '@voucha/types'

const enqueueAdmission = createBackgroundEnqueue(NOTIFICATIONS_ADMIT_COPYRIGHT_CASE_PURGE_JOB)
const FIVE_MINUTES_MS = 5 * 60_000

/** Manual admission uses the same scheduled job; each run pages its own index cursor. */
export function enqueueCopyrightCasePurgeAdmission(): EnqueueReturnType {
  return enqueueAdmission(
    {},
    {
      deduplication: {
        id: 'copyright-case-purge-admission',
        mode: 'throttle',
        ttl: FIVE_MINUTES_MS,
      },
    },
  )
}
