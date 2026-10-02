import { Queue } from 'glide-mq'
import { afterEach, describe, expect, it } from 'vitest'
import { promoteDelayedJobs } from './queue-jobs.mts'

describe('promoteDelayedJobs', () => {
  // No worker is attached to these queues, so a released job stays `waiting` where it can be read.
  const queues: Queue[] = []

  function newQueue(): Queue {
    const queue = new Queue(`promote-delayed-${crypto.randomUUID()}`, {})
    queues.push(queue)
    return queue
  }

  afterEach(async () => {
    await Promise.all(queues.splice(0).map(queue => queue.obliterate({ force: true })))
  })

  it('releases a job parked by the delay option', async () => {
    const queue = newQueue()
    const job = await queue.add('later', { n: 1 }, { delay: 60_000 })

    await expect(promoteDelayedJobs(queue)).resolves.toBe(1)

    expect(await (await queue.getJob(job!.id))!.getState()).toBe('waiting')
  })

  it('leaves a prioritized job alone even though the queue reports it as delayed', async () => {
    const queue = newQueue()
    const job = await queue.add('urgent', { n: 1 }, { priority: 5 })

    expect(await queue.getJobs('delayed')).toHaveLength(1)
    await expect(promoteDelayedJobs(queue)).resolves.toBe(0)

    expect(await (await queue.getJob(job!.id))!.getState()).toBe('prioritized')
  })

  it('promotes only the jobs matching the name and data filter', async () => {
    const queue = newQueue()
    const wanted = await queue.add('recompute', { id: 'a' }, { delay: 60_000 })
    await queue.add('recompute', { id: 'b' }, { delay: 60_000 })
    await queue.add('other', { id: 'a' }, { delay: 60_000 })

    await expect(promoteDelayedJobs(queue, { name: 'recompute', data: { id: 'a' } })).resolves.toBe(
      1,
    )

    expect(await (await queue.getJob(wanted!.id))!.getState()).toBe('waiting')
    expect(await queue.getJobs('delayed')).toHaveLength(2)
  })

  it('ends the throttle window of a promoted job so the next enqueue is accepted', async () => {
    const queue = newQueue()
    const deduplication = { id: 'recompute-1', mode: 'throttle' as const, ttl: 5_000 }
    await queue.add('recompute', {}, { delay: 6_000, deduplication })
    await expect(queue.add('recompute', {}, { delay: 6_000, deduplication })).resolves.toBeNull()

    await promoteDelayedJobs(queue)

    await expect(
      queue.add('recompute', {}, { delay: 6_000, deduplication }),
    ).resolves.not.toBeNull()
  })

  it('keeps the window of a job that is not the one being promoted', async () => {
    const queue = newQueue()
    const deduplication = { id: 'recompute-2', mode: 'throttle' as const, ttl: 5_000 }
    await queue.add('recompute', { n: 1 }, { delay: 6_000, deduplication })
    await queue.add('other', { n: 2 }, { delay: 6_000 })

    await promoteDelayedJobs(queue, { name: 'other' })

    await expect(queue.add('recompute', { n: 3 }, { deduplication })).resolves.toBeNull()
  })

  it('reports zero when nothing is delayed', async () => {
    await expect(promoteDelayedJobs(newQueue())).resolves.toBe(0)
  })
})
