import { TestWorker } from 'glide-mq/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { addAndFlush } from './glide-mq-vitest-flush.mts'
import {
  captureAttachedTestWorkers,
  configureDeadLetterQueue,
  getUnexpectedAttachedTestWorkerQueueNames,
  getDeadLetterJobs,
  getOrCreateQueue,
} from './glide-mq-vitest-internals.mts'
import { Queue } from './glide-mq-vitest-shim.mts'

function uniqueQueueName(label: string): string {
  return `flush-${label}-${crypto.randomUUID()}`
}

describe('GlideMQ dead-letter and retry', () => {
  const workers: TestWorker<unknown, unknown>[] = []

  afterEach(async () => {
    const closing = workers.splice(0)
    await Promise.all(closing.map(worker => worker.close()))
  })

  it('waits for the DLQ record when expectDeadLetter is set', async () => {
    const queueName = uniqueQueueName('dlq')
    const deadLetterQueue = { name: `${queueName}-dlq` }
    const queue = getOrCreateQueue(queueName)
    configureDeadLetterQueue(queueName, deadLetterQueue)
    workers.push(
      new TestWorker(queue, async () => {
        throw new Error('planned failure')
      }),
    )

    const job = await addAndFlush(queue, 'fail', { id: 'job-1' }, { expectDeadLetter: true })
    expect(job).not.toBeNull()
    const deadLetterJobs = await getDeadLetterJobs(queueName)
    expect(deadLetterJobs).toHaveLength(1)
    expect(deadLetterJobs[0]?.data).toMatchObject({
      originalQueue: queueName,
      originalJobId: job!.id,
      data: { id: 'job-1' },
      attemptsMade: 1,
    })
  })

  it('dead-letters a retried job once, after its last attempt', async () => {
    const queueName = uniqueQueueName('dlq-retried')
    const queue = getOrCreateQueue(queueName)
    configureDeadLetterQueue(queueName, { name: `${queueName}-dlq` })
    let attempts = 0
    workers.push(
      new TestWorker(queue, async () => {
        attempts++
        throw new Error('planned failure')
      }),
    )

    await addAndFlush(
      queue,
      'fail',
      { id: 'job-1' },
      { attempts: 3, backoff: { type: 'fixed', delay: 60_000 }, expectDeadLetter: true },
    )

    expect(attempts).toBe(3)
    expect(await getDeadLetterJobs(queueName)).toHaveLength(1)
  })

  it('does not sleep through the backoff of a retried job', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('retry-backoff'))
    let attempts = 0
    workers.push(
      new TestWorker(queue, async () => {
        attempts++
        if (attempts === 1) throw new Error('first attempt fails')
        return 'ok'
      }),
    )

    const job = await addAndFlush(
      queue,
      'flaky',
      { n: 1 },
      { attempts: 2, backoff: { type: 'fixed', delay: 60_000 } },
    )

    expect(attempts).toBe(2)
    expect((await queue.getJob(job!.id))?.returnvalue).toBe('ok')
  })

  it('keeps the hooks after the queue is closed', async () => {
    const queue = getOrCreateQueue(uniqueQueueName('closed'))
    await queue.close()
    let attempts = 0
    workers.push(
      new TestWorker(queue, async () => {
        attempts++
        if (attempts === 1) throw new Error('first attempt fails')
        return 'ok'
      }),
    )

    await addAndFlush(
      queue,
      'flaky',
      {},
      { attempts: 2, backoff: { type: 'fixed', delay: 60_000 } },
    )

    expect(attempts).toBe(2)
  })

  it('retries a failed job returned by shim Queue.getJobs', async () => {
    const name = uniqueQueueName('retry-failed')
    const inner = getOrCreateQueue(name)
    workers.push(
      new TestWorker(inner, () => {
        throw new Error('planned failure')
      }),
    )
    await addAndFlush(inner, 'fail', { n: 1 }).then(
      () => {
        throw new Error('expected addAndFlush to reject')
      },
      () => undefined,
    )

    const queue = new Queue(name)
    const failedJobs = await queue.getJobs('failed')
    expect(failedJobs).toHaveLength(1)
    const failedJob = failedJobs[0]
    const closing = workers.splice(0)
    await Promise.all(closing.map(worker => worker.close()))
    await failedJob.retry()

    expect(await queue.getJobs('failed')).toHaveLength(0)
    expect(await queue.getJobs('waiting')).toHaveLength(1)
  })
})

describe('attached TestWorker snapshots', () => {
  const workers: TestWorker<unknown, unknown>[] = []

  afterEach(async () => {
    await Promise.all(workers.splice(0).map(worker => worker.close()))
  })

  it('returns no unexpected queues when no workers are attached', async () => {
    const baseline = await captureAttachedTestWorkers()

    expect(await getUnexpectedAttachedTestWorkerQueueNames(baseline)).toEqual([])
  })

  it('allows the worker captured in its baseline', async () => {
    const worker = new TestWorker(
      getOrCreateQueue(uniqueQueueName('baseline')),
      async () => undefined,
    )
    workers.push(worker)
    const baseline = await captureAttachedTestWorkers()

    expect(await getUnexpectedAttachedTestWorkerQueueNames(baseline)).toEqual([])
  })

  it('detects a second worker attached to an allowed queue by identity', async () => {
    const queueName = uniqueQueueName('same-queue')
    const queue = getOrCreateQueue(queueName)
    workers.push(new TestWorker(queue, async () => undefined))
    const baseline = await captureAttachedTestWorkers()
    workers.push(new TestWorker(queue, async () => undefined))

    expect(await getUnexpectedAttachedTestWorkerQueueNames(baseline)).toEqual([queueName])
  })

  it('ignores a worker after it closes', async () => {
    const baseline = await captureAttachedTestWorkers()
    const worker = new TestWorker(
      getOrCreateQueue(uniqueQueueName('closed')),
      async () => undefined,
    )
    await worker.close()

    expect(await getUnexpectedAttachedTestWorkerQueueNames(baseline)).toEqual([])
  })

  it('deduplicates and sorts queue names for multiple unexpected workers', async () => {
    const baseline = await captureAttachedTestWorkers()
    const alpha = uniqueQueueName('alpha')
    const zeta = uniqueQueueName('zeta')
    workers.push(
      new TestWorker(getOrCreateQueue(zeta), async () => undefined),
      new TestWorker(getOrCreateQueue(alpha), async () => undefined),
      new TestWorker(getOrCreateQueue(alpha), async () => undefined),
    )

    expect(await getUnexpectedAttachedTestWorkerQueueNames(baseline)).toEqual([alpha, zeta])
  })

  it('keeps the captured baseline immutable after later attachments', async () => {
    const baseline = await captureAttachedTestWorkers()
    const queueName = uniqueQueueName('later')
    const worker = new TestWorker(getOrCreateQueue(queueName), async () => undefined)
    workers.push(worker)

    expect(baseline.has(worker.id)).toBe(false)
    expect(await getUnexpectedAttachedTestWorkerQueueNames(baseline)).toEqual([queueName])
  })
})
