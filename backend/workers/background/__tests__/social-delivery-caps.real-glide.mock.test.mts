import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB,
  ACTIVITYPUB_DELIVER_ACTIVITY_JOB,
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import { FOLLOWER_DISTRIBUTIONS_PROCESS_JOB } from '@queues/background/enqueues/follower-distributions-jobs'
import {
  NOTIFICATIONS_DELETE_JOB,
  NOTIFICATIONS_FOLLOW_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import { measureDomainCap } from '@voucha/test-helpers/real-glide-domain-cap'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

function measure(jobs: readonly BackgroundJobDefinition[], cap: number): Promise<number> {
  return measureDomainCap({ jobs, cap, connection, createProcessor: createBackgroundProcessor })
}

describe('social delivery domains enforce worker caps on the shared queue', () => {
  it('runs at most five notifications jobs of any name at once', async () => {
    await expect(measure([NOTIFICATIONS_DELETE_JOB, NOTIFICATIONS_FOLLOW_JOB], 5)).resolves.toBe(5)
  })

  it('runs at most five follower-distributions jobs at once', async () => {
    await expect(measure([FOLLOWER_DISTRIBUTIONS_PROCESS_JOB], 5)).resolves.toBe(5)
  })

  it('reserves independent outbound, inbound, and cleanup ActivityPub capacity', async () => {
    await expect(
      measure(
        [
          ...Array.from({ length: 5 }, () => ACTIVITYPUB_DELIVER_ACTIVITY_JOB),
          ...Array.from({ length: 4 }, () => ACTIVITYPUB_PROCESS_DELIVERY_JOB),
          ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB,
        ],
        10,
      ),
    ).resolves.toBe(10)
  })
})
