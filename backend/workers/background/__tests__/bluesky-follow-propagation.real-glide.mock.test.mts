import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  BLUESKY_FOLLOW_PROPAGATION_BACKFILL_FOLLOWS_JOB,
  BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB,
  BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB,
} from '@queues/background/enqueues/bluesky-follow-propagation-jobs'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('bluesky follow propagation group through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('never runs two Bluesky-token jobs of any name at once across workers', async () => {
    let active = 0
    let maxActive = 0
    let started = 0
    const firstStarted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const track = async (): Promise<void> => {
      started += 1
      active += 1
      maxActive = Math.max(maxActive, active)
      firstStarted.resolve()
      await release.promise
      active -= 1
    }
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      workers: 2,
      concurrency: 2,
      bodies: {
        [BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB.name]: track,
        [BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB.name]: track,
        [BLUESKY_FOLLOW_PROPAGATION_BACKFILL_FOLLOWS_JOB.name]: track,
      },
    })
    harness.registerBeforeClose(() => release.resolve())
    try {
      const jobs = await Promise.all([
        harness.add(BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB, {
          followerUserId: randomUUID(),
          followeeUserId: randomUUID(),
        }),
        harness.add(BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB, {
          userId: randomUUID(),
          blueskyDid: `did:plc:${randomUUID()}`,
          linkAuthorizationId: randomUUID(),
        }),
        harness.add(BLUESKY_FOLLOW_PROPAGATION_BACKFILL_FOLLOWS_JOB, {}),
        harness.add(BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB, {
          followerUserId: randomUUID(),
          followeeUserId: randomUUID(),
        }),
      ])
      await firstStarted.promise

      // Four slots across two workers would run all four at once without the domain-wide group.
      expect(started).toBe(1)
      expect(maxActive).toBe(1)

      release.resolve()
      await Promise.all(jobs.map(job => harness!.settled(job)))
      expect(started).toBe(jobs.length)
      expect(maxActive).toBe(1)
    } finally {
      release.resolve()
    }
  })
})
