import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { NOTIFICATIONS_SWEEP_COPYRIGHT_RETENTION_JOB } from '@queues/background/enqueues/notifications-jobs'
import type { EnqueueReturnType } from '@voucha/types'

// The scheduler runs hourly. This throttle only bounds repeated manual triggers: every run is
// bounded, row-locked and idempotent, so an overlapping run is harmless.
const FIVE_MINUTES_MS = 5 * 60 * 1000
const enqueueSweep = createBackgroundEnqueue(NOTIFICATIONS_SWEEP_COPYRIGHT_RETENTION_JOB)

export function enqueueSweepCopyrightEvidenceRetention(): EnqueueReturnType {
  return enqueueSweep(
    {},
    {
      deduplication: {
        id: 'copyright-evidence-retention',
        mode: 'throttle',
        ttl: FIVE_MINUTES_MS,
      },
    },
  )
}
