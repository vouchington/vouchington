import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  CACHE_PURGE_RATE_LIMIT,
  CACHE_PURGE_TAGS_JOB,
} from '@queues/background/enqueues/cache-purge-jobs'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('cache-purge domain rate limit through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('starts no more purges than the Workers Cache window allows, across workers', async () => {
    const startedIds: string[] = []
    const windowFull = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      workers: 2,
      concurrency: 5,
      bodies: {
        [CACHE_PURGE_TAGS_JOB.name]: job => {
          startedIds.push(job.id)
          if (startedIds.length === CACHE_PURGE_RATE_LIMIT.max) windowFull.resolve()
        },
      },
    })
    const jobs = await Promise.all(
      Array.from({ length: CACHE_PURGE_RATE_LIMIT.max + 1 }, () =>
        harness!.add(CACHE_PURGE_TAGS_JOB, { tags: [`post:${randomUUID()}`] }),
      ),
    )

    await windowFull.promise
    const started = jobs.filter(job => startedIds.includes(job.id))
    await Promise.all(started.map(job => harness!.settled(job)))

    // Ten free slots across two workers remain, so the last job only waits because the window is spent.
    expect(startedIds).toHaveLength(CACHE_PURGE_RATE_LIMIT.max)
    const waiting = jobs.filter(job => !startedIds.includes(job.id))
    expect(waiting).toHaveLength(1)
    expect(await harness.queue.getJob(waiting[0]!.id).then(job => job?.getState())).not.toBe(
      'completed',
    )
  })
})
