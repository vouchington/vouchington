import { TestWorker } from 'glide-mq/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { addAndFlush } from './glide-mq-vitest-flush.mts'
import {
  captureAttachedTestWorkers,
  configureDeadLetterQueue,
  getUnexpectedAttachedTestWorkerQueueNames,
  getDeadLetterJobs,
  getOrCreateQueue,
  wireDeadLetterQueue,
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
    const worker = new TestWorker(queue, () => {
      throw new Error('planned failure')
    })
    wireDeadLetterQueue(worker, queueName, deadLetterQueue)
    workers.push(worker)

    const job = await addAndFlush(queue, 'fail', { id: 'job-1' }, { expectDeadLetter: true })
    expect(job).not.toBeNull()
    const deadLetterJobs = await getDeadLetterJobs(queueName)
    expect(deadLetterJobs).toHaveLength(1)
    expect(deadLetterJobs[0]?.data).toMatchObject({
      originalQueue: queueName,
      originalJobId: job!.id,
      data: { id: 'job-1' },
    })
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

    expect(inner.jobs.get(failedJob.id)?.state).toBe('waiting')
    expect(await queue.getJobs('failed')).toHaveLength(0)
  })
})

describe('attached TestWorker snapshots', () => {
  const workers: TestWorker<unknown, unknown>[] = []

  afterEach(async () => {
    await Promise.all(workers.splice(0).map(worker => worker.close()))
  })

  it('returns no unexpected queues when no workers are attached', () => {
    const baseline = captureAttachedTestWorkers()

    expect(getUnexpectedAttachedTestWorkerQueueNames(baseline)).toEqual([])
  })

  it('allows the worker captured in its baseline', () => {
    const worker = new TestWorker(
      getOrCreateQueue(uniqueQueueName('baseline')),
      async () => undefined,
    )
    workers.push(worker)
    const baseline = captureAttachedTestWorkers()

    expect(getUnexpectedAttachedTestWorkerQueueNames(baseline)).toEqual([])
  })

  it('detects a second worker attached to an allowed queue by identity', () => {
    const queueName = uniqueQueueName('same-queue')
    const queue = getOrCreateQueue(queueName)
    workers.push(new TestWorker(queue, async () => undefined))
    const baseline = captureAttachedTestWorkers()
    workers.push(new TestWorker(queue, async () => undefined))

    expect(getUnexpectedAttachedTestWorkerQueueNames(baseline)).toEqual([queueName])
  })

  it('ignores a worker after it closes', async () => {
    const baseline = captureAttachedTestWorkers()
    const worker = new TestWorker(
      getOrCreateQueue(uniqueQueueName('closed')),
      async () => undefined,
    )
    await worker.close()

    expect(getUnexpectedAttachedTestWorkerQueueNames(baseline)).toEqual([])
  })

  it('deduplicates and sorts queue names for multiple unexpected workers', () => {
    const baseline = captureAttachedTestWorkers()
    const alpha = uniqueQueueName('alpha')
    const zeta = uniqueQueueName('zeta')
    workers.push(
      new TestWorker(getOrCreateQueue(zeta), async () => undefined),
      new TestWorker(getOrCreateQueue(alpha), async () => undefined),
      new TestWorker(getOrCreateQueue(alpha), async () => undefined),
    )

    expect(getUnexpectedAttachedTestWorkerQueueNames(baseline)).toEqual([alpha, zeta])
  })

  it('keeps the captured baseline immutable after later attachments', () => {
    const baseline = captureAttachedTestWorkers()
    const queueName = uniqueQueueName('later')
    const worker = new TestWorker(getOrCreateQueue(queueName), async () => undefined)
    workers.push(worker)

    expect(baseline.has(worker)).toBe(false)
    expect(getUnexpectedAttachedTestWorkerQueueNames(baseline)).toEqual([queueName])
  })
})
