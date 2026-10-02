import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import { PRIORITY_DEFAULT, QUEUE_NAME } from '../config.mts'
import { notifications } from '../queues.mts'

// The scheduler runs hourly. This throttle only bounds repeated manual triggers: every run is
// bounded, row-locked and idempotent, so an overlapping run is harmless.
const FIVE_MINUTES_MS = 5 * 60 * 1000
const enqueueSweep = createEnqueueFunction<
  Record<string, never>,
  'processSweepCopyrightEvidenceRetention'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processSweepCopyrightEvidenceRetention',
})

export function enqueueSweepCopyrightEvidenceRetention(): EnqueueReturnType {
  return enqueueSweep(
    {},
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: PRIORITY_DEFAULT,
      deduplication: {
        id: 'copyright-evidence-retention',
        mode: 'throttle',
        ttl: FIVE_MINUTES_MS,
      },
    },
  )
}
