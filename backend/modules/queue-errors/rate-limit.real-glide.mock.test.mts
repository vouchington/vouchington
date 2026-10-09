import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents, Worker, type Job, type WorkerOptions } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { HttpRateLimitError } from '@modules/on-error/errors'
import { deferJobForRateLimit, throwRateLimited, wrapHttpForRetry } from './index.mts'

// This project deliberately restores real GlideMQ: the delayed state, the attempt counter and the
// events come from the server-side scripts, which the in-memory shim promotes at once.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1_000 },
  removeOnComplete: 100,
  removeOnFail: 100,
}

async function withQueue(
  processor: (job: Job) => Promise<unknown>,
  workerOptions: Partial<WorkerOptions>,
  run: (queue: Queue, events: QueueEvents) => Promise<void>,
): Promise<void> {
  const name = `queue_errors_rate_limit_${randomUUID()}`
  const queue = new Queue(name, connection)
  const events = new QueueEvents(name, { ...connection, lastEventId: '0', blockTimeout: 1_000 })
  const worker = new Worker(name, processor, {
    ...connection,
    blockTimeout: 1_000,
    ...workerOptions,
  })
  try {
    await Promise.all([events.waitUntilReady(), worker.waitUntilReady()])
    await run(queue, events)
  } finally {
    await Promise.all([worker.close(true), events.close()])
    await queue.obliterate({ force: true })
    await queue.close()
  }
}

describe('provider rate limits with real GlideMQ', () => {
  it.each([
    ['the shared signal', async () => throwRateLimited(30_000, new Error('429')), 30_000],
    [
      'wrapHttpForRetry on an HttpRateLimitError',
      async () =>
        Promise.reject(
          new HttpRateLimitError('https://remote.example.test/inbox', 429, 45_000),
        ).catch(wrapHttpForRetry),
      45_000,
    ],
  ])(
    'requeues a job for the provider wait without consuming an attempt: %s',
    async (_name, processor, waitMs) => {
      await withQueue(processor, {}, async (queue, events) => {
        const retrying = once(events, 'retrying')
        const job = await queue.add('provider-call', {}, JOB_OPTIONS)
        if (!job) throw new Error('Expected the provider-call job')

        const [event] = await retrying

        expect(event).toMatchObject({ jobId: job.id, attemptsMade: '0', delay: String(waitMs) })
        const stored = await queue.getJob(job.id)
        expect(await stored?.getState()).toBe('delayed')
        expect(stored?.attemptsMade).toBe(0)
      })
    },
  )

  it('parks only the job that hit the limit so provider-free jobs on the same worker keep running', async () => {
    const reconciled = Promise.withResolvers<void>()
    const processor = async (job: Job): Promise<string> => {
      if (job.name === 'provider-call') return deferJobForRateLimit(job, 30_000)
      reconciled.resolve()
      return 'reconciled'
    }
    // The limiter is what makes a worker idle itself after a rate-limit signal.
    await withQueue(
      processor,
      { limiter: { max: 100, duration: 1_000 } },
      async (queue, events) => {
        const delayed = once(events, 'delay-changed')
        const providerJob = await queue.add('provider-call', {}, JOB_OPTIONS)
        if (!providerJob) throw new Error('Expected the provider-call job')
        const [event] = await delayed

        expect(event).toMatchObject({ jobId: providerJob.id })
        expect(Number((event as { delay: string }).delay)).toBeGreaterThan(29_000)
        expect(Number((event as { delay: string }).delay)).toBeLessThanOrEqual(30_000)
        const stored = await queue.getJob(providerJob.id)
        expect(await stored?.getState()).toBe('delayed')
        expect(stored?.attemptsMade).toBe(0)

        await queue.add('reconcile', {}, JOB_OPTIONS)
        await reconciled.promise
      },
    )
  })
})
