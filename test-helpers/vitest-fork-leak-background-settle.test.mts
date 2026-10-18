import { TestWorker } from 'glide-mq/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { TestQueueFlushTimeoutError } from './glide-mq-vitest-flush-diagnostics.mts'
import { getOrCreateQueue } from './glide-mq-vitest-internals.mts'
import { settleRunnableQueueJobs } from './vitest-fork-leak-background-settle.mts'

function uniqueQueueName(label: string): string {
  return `fork-leak-settle-${label}-${crypto.randomUUID()}`
}

describe('settleRunnableQueueJobs', () => {
  const workers: TestWorker<unknown, unknown>[] = []
  let releaseHang: (() => void) | undefined

  afterEach(async () => {
    releaseHang?.()
    releaseHang = undefined
    const closing = workers.splice(0)
    await Promise.all(closing.map(worker => worker.close()))
  })

  it('does not return while an active job can still hold a connection', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('active'))
    let releaseProcessor!: () => void
    const processorGate = new Promise<void>(resolve => {
      releaseProcessor = resolve
    })
    let processorStarted!: () => void
    const started = new Promise<void>(resolve => {
      processorStarted = resolve
    })
    let settled = false
    workers.push(
      new TestWorker(queue, async () => {
        processorStarted()
        await processorGate
        expect(settled).toBe(false)
      }),
    )
    releaseHang = releaseProcessor
    const job = await queue.enqueue('work', { n: 1 })
    await started
    expect(queue.jobs.get(job!.id)?.state).toBe('active')

    const pending = settleRunnableQueueJobs(queue, { includeWaiting: true })
    releaseProcessor()
    await pending
    settled = true
    expect(queue.jobs.get(job!.id)?.state).toBe('completed')
    expect(queue.settleWaiters.size).toBe(0)
  })

  it('returns after a runnable job fails instead of rejecting the wait', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('failed'))
    workers.push(
      new TestWorker(queue, async () => {
        throw new Error('planned failure')
      }),
    )
    const job = await queue.enqueue('fail', {})
    await settleRunnableQueueJobs(queue, { includeWaiting: true })
    expect(await job!.getState()).toBe('failed')
  })

  it('does not wait for a delayed job', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('delayed'))
    workers.push(new TestWorker(queue, async () => 'not run'))
    const job = await queue.enqueue('later', {}, { delay: 60_000 })
    await settleRunnableQueueJobs(queue, { includeWaiting: true, flushTimeoutMs: 200 })
    expect(await job!.getState()).toBe('delayed')
  })

  it('returns immediately when no worker can make progress', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('no-worker'))
    const job = await queue.enqueue('orphan', {})
    await settleRunnableQueueJobs(queue, { includeWaiting: true, flushTimeoutMs: 50 })
    expect(await job!.getState()).toBe('waiting')
  })

  it('waits for a prioritized job that getJobs cannot list', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('prioritized'))
    await queue.pause()
    workers.push(new TestWorker(queue, async () => 'not run'))
    const job = await queue.enqueue('ranked', {}, { priority: 1 })
    expect(queue.jobs.get(job!.id)?.state).toBe('prioritized')
    expect(await queue.getJobs('waiting')).toHaveLength(0)
    await expect(
      settleRunnableQueueJobs(queue, { includeWaiting: true, flushTimeoutMs: 50 }),
    ).rejects.toBeInstanceOf(TestQueueFlushTimeoutError)
    expect(queue.settleWaiters.size).toBe(0)
  })

  it('leaves waiting jobs alone when the caller excludes them', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('paused-waiting'))
    await queue.pause()
    workers.push(new TestWorker(queue, async () => 'not run'))
    const job = await queue.enqueue('parked', {})
    expect(await job!.getState()).toBe('waiting')
    await settleRunnableQueueJobs(queue, { includeWaiting: false, flushTimeoutMs: 200 })
    expect(await job!.getState()).toBe('waiting')
    expect(queue.settleWaiters.size).toBe(0)
  })

  it('times out when an in-scope waiting job cannot run', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('waiting-timeout'))
    await queue.pause()
    workers.push(new TestWorker(queue, async () => 'not run'))
    const job = await queue.enqueue('stuck', {})
    expect(await job!.getState()).toBe('waiting')
    await expect(
      settleRunnableQueueJobs(queue, { includeWaiting: true, flushTimeoutMs: 50 }),
    ).rejects.toBeInstanceOf(TestQueueFlushTimeoutError)
    expect(await job!.getState()).toBe('waiting')
    expect(queue.settleWaiters.size).toBe(0)
  })

  it('times out while a job stays active', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('active-timeout'))
    let releaseProcessor!: () => void
    const processorGate = new Promise<void>(resolve => {
      releaseProcessor = resolve
    })
    let processorStarted!: () => void
    const started = new Promise<void>(resolve => {
      processorStarted = resolve
    })
    workers.push(
      new TestWorker(queue, async () => {
        processorStarted()
        await processorGate
      }),
    )
    releaseHang = releaseProcessor
    const job = await queue.enqueue('hung', {})
    await started
    await expect(
      settleRunnableQueueJobs(queue, { includeWaiting: true, flushTimeoutMs: 50 }),
    ).rejects.toBeInstanceOf(TestQueueFlushTimeoutError)
    expect(queue.jobs.get(job!.id)?.state).toBe('active')
    expect(queue.settleWaiters.size).toBe(0)
  })
})
