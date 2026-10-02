import { TestWorker } from 'glide-mq/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { addAndFlush } from './glide-mq-vitest-flush.mts'
import { configureDeadLetterQueue, getOrCreateQueue } from './glide-mq-vitest-internals.mts'
import { Queue } from './glide-mq-vitest-shim.mts'

function uniqueQueueName(label: string): string {
  return `obliterate-${label}-${crypto.randomUUID()}`
}

describe('GlideMQ test obliterate', () => {
  const workers: TestWorker<unknown, unknown>[] = []
  let releaseHang: (() => void) | undefined

  afterEach(async () => {
    releaseHang?.()
    releaseHang = undefined
    await Promise.all(workers.splice(0).map(worker => worker.close()))
  })

  it('clears jobs and schedulers, resumes a paused queue, and keeps the attached worker consuming', async () => {
    const name = uniqueQueueName('full')
    const queue = getOrCreateQueue(name)
    workers.push(new TestWorker(queue, async (job: { data: unknown }) => job.data))
    await addAndFlush(queue, 'done', { n: 1 })
    await queue.upsertJobScheduler('sched-1', { every: 60_000 }, { name: 'scheduled', data: {} })
    // A job the worker never gets to consume proves the queue is cleared rather than drained.
    await queue.pause()
    await queue.add('stuck', { n: 2 })

    const shimQueue = new Queue(name)
    await shimQueue.obliterate()

    expect(await shimQueue.getJobs('completed')).toHaveLength(0)
    expect(await shimQueue.getJobs('waiting')).toHaveLength(0)
    expect(await shimQueue.getRepeatableJobs()).toHaveLength(0)
    expect(await shimQueue.isPaused()).toBe(false)
    const again = await addAndFlush(queue, 'again', { n: 3 })
    expect((await shimQueue.getJob(again!.id))?.returnvalue).toEqual({ n: 3 })
  })

  it('forces past an active job instead of refusing', async () => {
    const name = uniqueQueueName('active')
    const queue = getOrCreateQueue(name)
    let processorStarted!: () => void
    const started = new Promise<void>(resolve => {
      processorStarted = resolve
    })
    const hang = new Promise<void>(resolve => {
      releaseHang = resolve
    })
    workers.push(
      new TestWorker(queue, async () => {
        processorStarted()
        await hang
      }),
    )
    await queue.add('hang', { n: 1 })
    await started

    await new Queue(name).obliterate()

    expect(await queue.getJobs('active')).toHaveLength(0)
  })

  it('cascades into the configured dead-letter queue', async () => {
    const name = uniqueQueueName('dlq')
    const dlqName = `${name}-dlq`
    const queue = getOrCreateQueue(name)
    configureDeadLetterQueue(name, { name: dlqName })
    workers.push(
      new TestWorker(queue, () => {
        throw new Error('planned failure')
      }),
    )

    await addAndFlush(queue, 'fail', { id: 'x' }, { expectDeadLetter: true })
    expect(await getOrCreateQueue(dlqName).getJobs('waiting')).toHaveLength(1)

    await new Queue(name).obliterate()
    expect(await getOrCreateQueue(dlqName).getJobs('waiting')).toHaveLength(0)
  })
})
