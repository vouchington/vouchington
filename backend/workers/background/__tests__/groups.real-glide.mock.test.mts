import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { throwRateLimited } from '@modules/queue-errors'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'
import { OPENAI_MODERATION_POST_JOB } from '@queues/background/enqueues/openai-moderation-jobs'
import { SES_INBOUND_PROCESS_JOB } from '@queues/background/enqueues/ses-inbound-jobs'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

function sesData() {
  const sesMessageId = `ses-${randomUUID()}`
  return { sesMessageId, objectKey: `copyright-incoming/${sesMessageId}` }
}

describe('background domain groups through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('never runs two jobs of a concurrency-1 domain at once across workers, and a flooded domain never blocks another', async () => {
    let active = 0
    let maxActive = 0
    const started: string[] = []
    const firstStarted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const otherDomainRan = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      workers: 2,
      bodies: {
        [SES_INBOUND_PROCESS_JOB.name]: async job => {
          started.push(job.id)
          active += 1
          maxActive = Math.max(maxActive, active)
          firstStarted.resolve()
          await release.promise
          active -= 1
        },
        [OPENAI_MODERATION_POST_JOB.name]: () => otherDomainRan.resolve(),
      },
    })
    try {
      const flood = await Promise.all(
        Array.from({ length: 6 }, () => harness!.add(SES_INBOUND_PROCESS_JOB, sesData())),
      )
      await firstStarted.promise
      const other = await harness.add(OPENAI_MODERATION_POST_JOB, { id: randomUUID() })

      // The second worker has a free slot and older ses jobs ahead of this one in the stream. It
      // reaches the other domain's job only because the group parked every ses job past the first.
      await otherDomainRan.promise
      expect(started).toHaveLength(1)
      expect(maxActive).toBe(1)

      release.resolve()
      await Promise.all([...flood, other].map(job => harness!.settled(job)))
      expect(started).toHaveLength(flood.length)
      expect(maxActive).toBe(1)
    } finally {
      // A failed assertion must not leave a handler holding the worker open.
      release.resolve()
    }
  })

  it('caps openai-moderation at its old worker concurrency of five while another domain runs beside it', async () => {
    let active = 0
    let maxActive = 0
    const fiveStarted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const otherDomainRan = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      concurrency: 8,
      bodies: {
        [OPENAI_MODERATION_POST_JOB.name]: async () => {
          active += 1
          maxActive = Math.max(maxActive, active)
          if (active === 5) fiveStarted.resolve()
          await release.promise
          active -= 1
        },
        [SES_INBOUND_PROCESS_JOB.name]: () => otherDomainRan.resolve(),
      },
    })
    try {
      const flood = await Promise.all(
        Array.from({ length: 8 }, () =>
          harness!.add(OPENAI_MODERATION_POST_JOB, { id: randomUUID() }),
        ),
      )
      await fiveStarted.promise
      const other = await harness.add(SES_INBOUND_PROCESS_JOB, sesData())

      // Three of the eight worker slots are free, and only another domain can use them.
      await otherDomainRan.promise
      expect(maxActive).toBe(5)

      release.resolve()
      await Promise.all([...flood, other].map(job => harness!.settled(job)))
      expect(maxActive).toBe(5)
    } finally {
      release.resolve()
    }
  })

  it('starts no more jobs than the group rate limit allows in its window', async () => {
    const WINDOW_MS = 400
    const startTimes: number[] = []
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      concurrency: 5,
      bodies: { [OPENAI_MODERATION_POST_JOB.name]: () => startTimes.push(Date.now()) },
    })
    const rateLimit = { max: 2, duration: WINDOW_MS }
    const jobs = await Promise.all(
      Array.from({ length: 5 }, () =>
        harness!.add(
          OPENAI_MODERATION_POST_JOB,
          { id: randomUUID() },
          { ordering: { key: 'openai-moderation', concurrency: 50, rateLimit } },
        ),
      ),
    )
    await Promise.all(jobs.map(job => harness!.settled(job)))

    const sorted = startTimes.toSorted((a, b) => a - b)
    expect(sorted).toHaveLength(5)
    // The third job cannot start until the first job's window has passed.
    expect(sorted[2]! - sorted[0]!).toBeGreaterThanOrEqual(WINDOW_MS - 100)
    expect(sorted.filter(time => time - sorted[0]! < WINDOW_MS - 100)).toHaveLength(2)
  })

  it('turns a provider rate-limit signal into a group deferral that spends no attempt and idles no other domain', async () => {
    let calls = 0
    const otherDomainRan = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [OPENAI_MODERATION_POST_JOB.name]: () => {
          calls += 1
          if (calls === 1) throwRateLimited(1_000)
        },
        [SES_INBOUND_PROCESS_JOB.name]: () => otherDomainRan.resolve(),
      },
    })
    const limited = await harness.add(
      OPENAI_MODERATION_POST_JOB,
      { id: randomUUID() },
      { attempts: 3 },
    )
    await harness.activated(limited, 1)
    const other = await harness.add(SES_INBOUND_PROCESS_JOB, sesData())

    // The shared worker keeps serving other domains while the limited job waits out its delay.
    await otherDomainRan.promise
    await expect(harness.settled(other)).resolves.toBe('completed')
    expect((await harness.queue.getJob(limited.id))?.attemptsMade).toBe(0)

    await expect(harness.settled(limited)).resolves.toBe('completed')
    expect(calls).toBe(2)
    expect((await harness.queue.getJob(limited.id))?.attemptsMade).toBe(0)
  })
})
