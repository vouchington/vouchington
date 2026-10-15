import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB,
  FIND_YOUR_FRIENDS_SYNC_X_JOB,
} from '@queues/background/enqueues/find-your-friends-jobs'
import { FIND_YOUR_FRIENDS_ORDERING } from '@queues/find-your-friends/config'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('find-your-friends provider lanes through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('caps the x lane at its own concurrency across workers without blocking the facebook lane', async () => {
    const { concurrency } = FIND_YOUR_FRIENDS_ORDERING.sync_x
    let active = 0
    let maxActive = 0
    let started = 0
    const lanesFull = Promise.withResolvers<void>()
    const facebookRan = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      workers: 2,
      concurrency: 3,
      bodies: {
        [FIND_YOUR_FRIENDS_SYNC_X_JOB.name]: async () => {
          started += 1
          active += 1
          maxActive = Math.max(maxActive, active)
          if (active === concurrency) lanesFull.resolve()
          await release.promise
          active -= 1
        },
        [FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB.name]: () => facebookRan.resolve(),
      },
    })
    try {
      const xJobs = await Promise.all(
        Array.from({ length: 5 }, () =>
          harness!.add(
            FIND_YOUR_FRIENDS_SYNC_X_JOB,
            { xUserId: randomUUID() },
            { ordering: FIND_YOUR_FRIENDS_ORDERING.sync_x },
          ),
        ),
      )
      await lanesFull.promise
      const facebook = await harness.add(
        FIND_YOUR_FRIENDS_SYNC_FACEBOOK_JOB,
        { facebookUserId: randomUUID() },
        { ordering: FIND_YOUR_FRIENDS_ORDERING.sync_facebook },
      )

      // Six free slots remain, so the facebook job only runs because the x lane parks the others.
      await facebookRan.promise
      expect(started).toBe(concurrency)
      expect(maxActive).toBe(concurrency)

      release.resolve()
      await Promise.all([...xJobs, facebook].map(job => harness!.settled(job)))
      expect(started).toBe(xJobs.length)
      expect(maxActive).toBe(concurrency)
    } finally {
      release.resolve()
    }
  })
})
