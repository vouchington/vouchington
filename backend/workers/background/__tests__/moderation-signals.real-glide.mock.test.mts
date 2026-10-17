import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  MODERATION_SIGNALS_BAN_EVASION_JOB,
  MODERATION_SIGNALS_SPAM_DETECTION_JOB,
} from '@queues/background/enqueues/moderation-signals-jobs'
import { getBackgroundDomainDefinition } from '@queues/background/enqueues/registry'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('moderation-signals domain through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('routes a spam-detection job and a ban-evasion job each to its own handler', async () => {
    const seen: string[] = []
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [MODERATION_SIGNALS_SPAM_DETECTION_JOB.name]: () => void seen.push('spam'),
        [MODERATION_SIGNALS_BAN_EVASION_JOB.name]: () => void seen.push('ban'),
      },
    })
    const spam = await harness.add(MODERATION_SIGNALS_SPAM_DETECTION_JOB, { id: randomUUID() })
    await expect(harness.settled(spam)).resolves.toBe('completed')
    const ban = await harness.add(MODERATION_SIGNALS_BAN_EVASION_JOB, {
      communityId: randomUUID(),
      userId: randomUUID(),
    })
    await expect(harness.settled(ban)).resolves.toBe('completed')

    expect(seen).toEqual(['spam', 'ban'])
  })

  it('keeps each job’s attempts, backoff, priority, and no ordering key or limiter', async () => {
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
    })
    const spam = await harness.add(MODERATION_SIGNALS_SPAM_DETECTION_JOB, { id: randomUUID() })
    const ban = await harness.add(MODERATION_SIGNALS_BAN_EVASION_JOB, {
      communityId: randomUUID(),
      userId: randomUUID(),
    })

    expect(getBackgroundDomainDefinition('moderation-signals').group).toBeUndefined()
    expect(spam.opts).toMatchObject({ attempts: 1, priority: 10 })
    expect(spam.opts.ordering).toBeUndefined()
    expect(ban.opts).toMatchObject({
      attempts: 3,
      priority: 10,
      backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    })
    expect(ban.opts.ordering).toBeUndefined()
  })

  it('fails a spam-detection job after its single attempt', async () => {
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [MODERATION_SIGNALS_SPAM_DETECTION_JOB.name]: () => {
          throw new Error('spam analysis failed')
        },
      },
    })
    const spam = await harness.add(MODERATION_SIGNALS_SPAM_DETECTION_JOB, { id: randomUUID() })

    await expect(harness.settled(spam)).resolves.toBe('failed')
    expect((await harness.queue.getJob(spam.id))?.attemptsMade).toBe(1)
  })

  it('runs more jobs at once than the old per-queue limiter allowed in a second', async () => {
    const JOBS = 7
    let active = 0
    let maxActive = 0
    const release = Promise.withResolvers<void>()
    const allRunning = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      concurrency: JOBS,
      bodies: {
        [MODERATION_SIGNALS_SPAM_DETECTION_JOB.name]: async () => {
          active += 1
          maxActive = Math.max(maxActive, active)
          if (active === JOBS) allRunning.resolve()
          await release.promise
          active -= 1
        },
      },
    })
    const jobs = []
    for (let index = 0; index < JOBS; index += 1) {
      const job = await harness.add(MODERATION_SIGNALS_SPAM_DETECTION_JOB, { id: randomUUID() })
      jobs.push(job)
    }
    await allRunning.promise
    expect(maxActive).toBe(JOBS)

    release.resolve()
    await Promise.all(jobs.map(job => harness!.settled(job)))
  })
})
