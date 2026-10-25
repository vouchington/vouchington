import { randomUUID } from 'node:crypto'
import { Queue } from 'glide-mq'
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
    try {
      await harness?.close()
    } finally {
      harness = undefined
    }
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

  it('keeps each job’s attempts, backoff, priority, and domain ordering key', async () => {
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
    })
    const spam = await harness.add(MODERATION_SIGNALS_SPAM_DETECTION_JOB, { id: randomUUID() })
    const ban = await harness.add(MODERATION_SIGNALS_BAN_EVASION_JOB, {
      communityId: randomUUID(),
      userId: randomUUID(),
    })

    expect(getBackgroundDomainDefinition('moderation-signals').rateLimit).toBeUndefined()
    expect(spam.opts).toMatchObject({ attempts: 1, priority: 10 })
    expect(spam.opts.ordering?.key).toBe('moderation-signals')
    expect(ban.opts).toMatchObject({
      attempts: 3,
      priority: 10,
      backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    })
    expect(ban.opts.ordering?.key).toBe('moderation-signals')
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
    harness.registerBeforeClose(() => release.resolve())
    const jobs = []
    try {
      for (let index = 0; index < JOBS; index += 1) {
        const job = await harness.add(MODERATION_SIGNALS_SPAM_DETECTION_JOB, { id: randomUUID() })
        jobs.push(job)
      }
      await allRunning.promise
      expect(maxActive).toBe(JOBS)
    } finally {
      release.resolve()
    }
    await Promise.all(jobs.map(job => harness!.settled(job)))
  })

  it('releases a held real handler before close joins it and removes its queue', async () => {
    const release = Promise.withResolvers<void>()
    const order: string[] = []
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      concurrency: 2,
      bodies: {
        [MODERATION_SIGNALS_SPAM_DETECTION_JOB.name]: async () => {
          order.push('started')
          await release.promise
          order.push('finished')
        },
      },
    })
    harness.registerBeforeClose(() => {
      order.push('released')
      release.resolve()
    })
    const held = await harness.add(MODERATION_SIGNALS_SPAM_DETECTION_JOB, { id: randomUUID() })
    await harness.activated(held, 1)
    const sibling = await harness.add(MODERATION_SIGNALS_BAN_EVASION_JOB, {
      communityId: randomUUID(),
      userId: randomUUID(),
    })
    await expect(harness.settled(sibling)).resolves.toBe('completed')
    await harness.close()
    order.push('closed')
    expect(order).toEqual(['started', 'released', 'finished', 'closed'])
    const probe = new Queue(harness.queue.name, connection)
    try {
      expect(await probe.getJob(held.id)).toBeNull()
      expect(await probe.getJob(sibling.id)).toBeNull()
    } finally {
      await probe.close()
    }
  })
})
