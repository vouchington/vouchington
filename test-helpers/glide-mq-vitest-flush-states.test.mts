import type { Job } from 'glide-mq'
import { TestWorker } from 'glide-mq/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addAndFlush, addBulkAndFlush } from './glide-mq-vitest-flush.mts'
import { getOrCreateQueue } from './glide-mq-vitest-internals.mts'

function uniqueQueueName(label: string): string {
  return `flush-states-${label}-${crypto.randomUUID()}`
}

describe('GlideMQ test flush across job states', () => {
  const workers: TestWorker<unknown, unknown>[] = []

  afterEach(async () => {
    await Promise.all(workers.splice(0).map(worker => worker.close()))
  })

  it('waits for a prioritized job, which a worker promotes before it runs', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('prioritized'))
    workers.push(new TestWorker(queue, async () => 'ok'))

    const job = await addAndFlush(queue, 'important', { n: 1 }, { priority: 5 })

    expect(await queue.getJob(job!.id)).toMatchObject({ returnvalue: 'ok' })
  })

  it('does not wait for a job parked by the delay option until it is promoted', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('delayed'))
    workers.push(new TestWorker(queue, async () => 'ok'))

    const job = await addAndFlush(queue, 'later', { n: 1 }, { delay: 60_000 })

    expect(await queue.getJobs('delayed')).toHaveLength(1)
    await job!.promote()
    await vi.waitFor(async () => expect(await queue.getJobs('completed')).toHaveLength(1))
  })

  it('still throws for a failed job whose record removeOnFail already deleted', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('remove-on-fail'))
    workers.push(
      new TestWorker(queue, () => {
        throw new Error('planned failure')
      }),
    )

    await expect(
      addAndFlush(queue, 'doomed', { n: 1 }, { attempts: 1, removeOnFail: true }),
    ).rejects.toThrow('planned failure')
    expect(queue.jobs.size).toBe(0)
    expect(queue.failureWatchers.size).toBe(0)
  })

  it('ignores a stale job that fails under a reused id after an obliterate', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('stale-id'))
    const releaseStale = Promise.withResolvers<void>()
    const releaseFresh = Promise.withResolvers<void>()
    const staleStarted = Promise.withResolvers<void>()
    const freshStarted = Promise.withResolvers<void>()
    workers.push(
      new TestWorker(
        queue,
        async (job: Job) => {
          if (job.name === 'stale') {
            staleStarted.resolve()
            await releaseStale.promise
            throw new Error('stale failure')
          }
          freshStarted.resolve()
          await releaseFresh.promise
          return 'ok'
        },
        { concurrency: 2 },
      ),
    )
    await queue.add('stale', {}, { attempts: 1 })
    await staleStarted.promise
    await queue.obliterate({ force: true })

    // The obliterate restarted the id counter, so the fresh job reuses the stale job's id.
    const flush = addAndFlush(queue, 'fresh', {}, { attempts: 1 })
    await freshStarted.promise
    releaseStale.resolve()
    const staleFailed = new Promise<void>(resolve => queue.once('failed', () => resolve()))
    releaseStale.resolve()
    await staleFailed
    releaseFresh.resolve()

    await expect(flush).resolves.toMatchObject({ name: 'fresh' })
  })

  it('keeps a deduplicated add at its own index in addBulkAndFlush', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('bulk-dedup'))
    workers.push(new TestWorker(queue, async () => 'ok'))
    const deduplication = { id: 'same', mode: 'simple' as const }

    const jobs = await addBulkAndFlush(queue, [
      { name: 'first', data: {}, opts: { deduplication, delay: 60_000 } },
      { name: 'second', data: {}, opts: { deduplication } },
      { name: 'third', data: {} },
    ])

    expect(jobs.map(job => job?.name ?? null)).toEqual(['first', null, 'third'])
  })
})
