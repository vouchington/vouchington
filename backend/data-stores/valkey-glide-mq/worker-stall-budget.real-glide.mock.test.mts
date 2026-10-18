import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Queue, Worker, UnrecoverableError } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from './index.mts'
import {
  PAGED_DISPATCHER_MAX_STALLED_COUNT,
  withPagedDispatcherStallBudget,
} from './worker-stall-budget.mts'

describe('per-job stall budgets on a shared worker', () => {
  it('fails an exhausted ordinary job before its handler while allowing a dispatcher to resume', async () => {
    const name = `stall-budget-${randomUUID()}`
    const prefix = `${workerQueuePrefix}:stall-budget:${randomUUID()}`
    const settings = { connection: workerQueueConnection, prefix }
    const queue = new Queue<{ id: string }>(name, settings)
    const ordinary = await queue.add('ordinary', { id: 'ordinary' }, { attempts: 3 })
    const dispatcher = await queue.add(
      'page',
      { id: 'dispatcher' },
      {
        backoff: { type: 'paged-dispatch-rss', delay: 1 },
      },
    )
    if (!ordinary || !dispatcher) throw new Error('Expected both jobs to be admitted')
    const client = await queue.getClient()
    await client.hset(`${prefix}:{${name}}:job:${ordinary.id}`, { stalledCount: '3' })
    await client.hset(`${prefix}:{${name}}:job:${dispatcher.id}`, { stalledCount: '3' })
    const invoked: string[] = []
    const failed = Promise.withResolvers<Error>()
    const completed = Promise.withResolvers<void>()
    const worker = new Worker(
      name,
      withPagedDispatcherStallBudget<{ id: string }, string>(
        name,
        async job => {
          invoked.push(job.data.id)
          return job.data.id
        },
        prefix,
      ),
      { ...settings, maxStalledCount: PAGED_DISPATCHER_MAX_STALLED_COUNT },
    )
    worker.on('failed', (job, err) => {
      if (job?.id !== ordinary.id) failed.reject(err)
      else {
        failed.resolve(err)
      }
    })
    worker.on('completed', job => {
      if (job.id === dispatcher.id) completed.resolve()
    })
    worker.on('error', failed.reject)
    try {
      const [failure] = await Promise.all([failed.promise, completed.promise])
      expect(failure).toBeInstanceOf(UnrecoverableError)
      expect(invoked).toEqual(['dispatcher'])
      expect(await (await queue.getJob(ordinary.id))?.getState()).toBe('failed')
      expect(await (await queue.getJob(dispatcher.id))?.getState()).toBe('completed')
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())
