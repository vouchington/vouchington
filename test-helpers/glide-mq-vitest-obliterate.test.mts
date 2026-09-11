import { TestWorker } from 'glide-mq/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { addAndFlush } from './glide-mq-vitest-flush.mts'
import {
  configureDeadLetterQueue,
  getOrCreateQueue,
  wireDeadLetterQueue,
} from './glide-mq-vitest-internals.mts'
import { Queue } from './glide-mq-vitest-shim.mts'

function uniqueQueueName(label: string): string {
  return `obliterate-${label}-${crypto.randomUUID()}`
}

describe('GlideMQ test obliterate', () => {
  const workers: TestWorker<unknown, unknown>[] = []

  afterEach(async () => {
    const closing = workers.splice(0)
    await Promise.all(closing.map(worker => worker.close()))
  })

  it('clears jobs, dedup state, waitingQueue, budgets, metrics, and schedulers, resumes a paused queue, and preserves attached workers', async () => {
    const name = uniqueQueueName('full')
    const queue = getOrCreateQueue(name)
    const worker = new TestWorker(queue, async (job: { data: unknown }) => job.data)
    workers.push(worker)

    const dedupOpts = { deduplication: { id: 'obliterate-dedup', mode: 'simple' as const } }
    const done = await addAndFlush(queue, 'done', { n: 1 }, dedupOpts)
    expect(done).not.toBeNull()
    expect((await queue.getMetrics('completed')).count).toBe(1)

    queue.setBudget('flow-1', { maxTotalTokens: 100 })
    queue.recordBudgetUsage('flow-1', { input: 5 }, {}, 5, 0)
    expect(queue.budgets.size).toBe(1)

    await queue.upsertJobScheduler('sched-1', { every: 60_000 }, { name: 'scheduled', data: {} })
    expect(await queue.getRepeatableJobs()).toHaveLength(1)

    // Seed a job that a worker never gets to consume, to prove waitingQueue is actually cleared
    // rather than relying on a worker draining it.
    await queue.pause()
    await queue.add('stuck', { n: 2 })
    expect(queue.waitingQueue).toHaveLength(1)
    expect(queue.isPaused()).toBe(true)

    const shimQueue = new Queue(name)
    await shimQueue.obliterate({ force: true })

    expect(queue.jobs.size).toBe(0)
    expect(queue.dedupSet.size).toBe(0)
    expect(queue.waitingQueue).toHaveLength(0)
    expect(queue.budgets.size).toBe(0)
    expect((await queue.getMetrics('completed')).count).toBe(0)
    expect(await queue.getRepeatableJobs()).toHaveLength(0)
    expect(queue.isPaused()).toBe(false)
    expect(queue.workers.has(worker)).toBe(true)

    // The dedup map is cleared too: the same id no longer references a (now-gone) job.
    const reAdded = await addAndFlush(queue, 'again', { n: 3 }, dedupOpts)
    expect(reAdded).not.toBeNull()
  })

  it('cascades into the configured dead-letter queue', async () => {
    const name = uniqueQueueName('dlq')
    const dlqName = `${name}-dlq`
    const queue = getOrCreateQueue(name)
    configureDeadLetterQueue(name, { name: dlqName })
    const worker = new TestWorker(queue, () => {
      throw new Error('planned failure')
    })
    wireDeadLetterQueue(worker, name, { name: dlqName })
    workers.push(worker)

    await addAndFlush(queue, 'fail', { id: 'x' }, { expectDeadLetter: true })
    expect(getOrCreateQueue(dlqName).jobs.size).toBe(1)

    await new Queue(name).obliterate({ force: true })
    expect(getOrCreateQueue(dlqName).jobs.size).toBe(0)
  })
})
