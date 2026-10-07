import { once } from 'node:events'
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
  const releases: Array<() => void> = []

  afterEach(async () => {
    for (const release of releases.splice(0)) release()
    await Promise.all(workers.splice(0).map(worker => worker.close()))
    vi.restoreAllMocks()
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
    const completed = once(queue, 'completed')
    await job!.promote()
    await completed
    expect(await queue.getJobs('completed')).toHaveLength(1)
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
    releases.push(releaseStale.resolve, releaseFresh.resolve)
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
    const staleFailed = once(queue, 'failed')
    releaseStale.resolve()
    await staleFailed
    releaseFresh.resolve()

    await expect(flush).resolves.toMatchObject({ name: 'fresh' })
  })

  it('settles an owned moveToDelayed without draining a held sibling', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('park'))
    const hold = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    releases.push(hold.resolve)
    workers.push(
      new TestWorker(
        queue,
        async (job: Job) => {
          if (job.name === 'held') {
            started.resolve()
            return hold.promise
          }
          return job.moveToDelayed(Date.now() + 60_000)
        },
        { concurrency: 2 },
      ),
    )
    const held = await queue.add('held', {})
    await started.promise
    const parked = await addAndFlush(queue, 'parked', {})
    expect(await parked!.getState()).toBe('delayed')
    expect(await held!.getState()).toBe('active')
    expect(queue.settleWaiters.size).toBe(0)
  })

  it('settles an owned suspension without draining a held sibling', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('suspend'))
    const hold = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    releases.push(hold.resolve)
    workers.push(
      new TestWorker(
        queue,
        async (job: Job) => {
          if (job.name === 'held') {
            started.resolve()
            return hold.promise
          }
          return job.suspend({ reason: 'owned pause' })
        },
        { concurrency: 2 },
      ),
    )
    const held = await queue.add('held', {})
    await started.promise
    const parked = await addAndFlush(queue, 'paused', {})
    expect(await parked!.getState()).toBe('suspended')
    expect(await held!.getState()).toBe('active')
    expect(queue.settleWaiters.size).toBe(0)
  })

  it('waits through native rate-limit parking and the next real attempt', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('rate-limit'))
    let attempts = 0
    workers.push(
      new TestWorker(queue, async () => {
        if (++attempts === 1) {
          const rateLimit: Error & { delayMs?: number } = new TestWorker.RateLimitError()
          rateLimit.delayMs = 1
          throw rateLimit
        }
        return 'after limit'
      }),
    )
    const job = await addAndFlush(queue, 'limited', {})
    expect(attempts).toBe(2)
    expect(await job!.getState()).toBe('completed')
    expect((await queue.getJob(job!.id))?.returnvalue).toBe('after limit')
  })

  it('rechecks a completion notified while an owned lookup is in flight', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('lookup-race'))
    const lookupStarted = Promise.withResolvers<void>()
    const releaseLookup = Promise.withResolvers<void>()
    const releaseProcessor = Promise.withResolvers<void>()
    releases.push(releaseLookup.resolve, releaseProcessor.resolve)
    workers.push(new TestWorker(queue, async () => releaseProcessor.promise))
    const getJob = queue.getJob
    vi.spyOn(queue, 'getJob').mockImplementationOnce(async (...args) => {
      const job = await getJob.call(queue, ...args)
      const getState = job!.getState
      vi.spyOn(job!, 'getState').mockImplementationOnce(async () => {
        const state = await getState.call(job)
        lookupStarted.resolve()
        await releaseLookup.promise
        return state
      })
      return job
    })
    const flush = addAndFlush(queue, 'race', {})
    await lookupStarted.promise
    const completed = once(queue, 'completed')
    releaseProcessor.resolve()
    await completed
    releaseLookup.resolve()
    const job = await flush
    expect(await job!.getState()).toBe('completed')
    expect(queue.settleWaiters.size).toBe(0)
  })

  it.each(['obliterate', 'drain', 'remove'] as const)(
    'settles a pending flush after owned queue %s',
    async operation => {
      const queue = getOrCreateQueue(uniqueQueueName(operation))
      await queue.pause()
      workers.push(new TestWorker(queue, async () => 'unexpected processing'))
      const inspected = Promise.withResolvers<{ id: string; state: string }>()
      const getJob = queue.getJob
      vi.spyOn(queue, 'getJob').mockImplementationOnce(async (...args) => {
        const job = await getJob.call(queue, ...args)
        const getState = job!.getState
        vi.spyOn(job!, 'getState').mockImplementationOnce(async () => {
          const state = await getState.call(job)
          inspected.resolve({ id: job!.id, state })
          return state
        })
        return job
      })
      const flush = addAndFlush(queue, 'removed', {})
      // This is the real owned pending-state read, not a scheduled recheck or microtask flush.
      const { id, state } = await inspected.promise
      expect(state).toBe('waiting')
      if (operation === 'obliterate') await queue.obliterate({ force: true })
      else if (operation === 'drain') await queue.drain()
      else await (await queue.getJob(id))!.remove()

      await expect(flush).resolves.toMatchObject({ id, name: 'removed' })
      expect(await queue.getJob(id)).toBeNull()
      expect(queue.settleWaiters.size).toBe(0)
      expect(queue.failureWatchers.size).toBe(0)
    },
  )

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
