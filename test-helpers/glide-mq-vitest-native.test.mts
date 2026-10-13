import type { TestJob, TestWorker } from 'glide-mq/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { getOrCreateQueue } from './glide-mq-vitest-internals.mts'
import { FlowProducer, Queue, Worker } from './glide-mq-vitest-shim.mts'

function queueName(label: string): string {
  return `native-${label}-${crypto.randomUUID()}`
}

describe('GlideMQ native testing adapters', () => {
  const workers: TestWorker[] = []

  afterEach(async () => {
    await Promise.all(workers.splice(0).map(worker => worker.close()))
  })

  it('exposes native job logs on the automatically flushed queue', async () => {
    const queue = new Queue(queueName('logs'))
    workers.push(
      new Worker(queue.name, async (job: TestJob) => {
        await job.log('processed')
      }),
    )

    const job = await queue.add('logged', {})

    expect(await queue.getJobLogs(job!.id)).toEqual({ logs: ['processed'], count: 1 })
  })

  it('lets native addAndWait own its deadline instead of the automatic flush', async () => {
    const queue = new Queue(queueName('explicit-wait'))
    const held = Promise.withResolvers<void>()
    workers.push(new Worker(queue.name, () => held.promise))

    try {
      await expect(queue.addAndWait('held', {}, { waitTimeout: 20 })).rejects.toThrow(
        'did not finish within 20ms',
      )
    } finally {
      held.resolve()
    }
  })

  it('replays on native admission even if the replayed job fails again', async () => {
    const deadLetterQueue = { name: queueName('replay-dlq') }
    const queue = new Queue(queueName('replay'), { deadLetterQueue })
    workers.push(
      new Worker(
        queue.name,
        () => {
          throw new Error('planned failure')
        },
        { deadLetterQueue },
      ),
    )
    await queue.add('fail', {}, { expectDeadLetter: true })
    const [originalLetter] = await queue.getDeadLetterJobs()

    const replayed = await queue.replayDeadLetterJob(originalLetter.id)

    await expect(queue.waitForJobs([replayed], { timeout: 200 })).rejects.toThrow('planned failure')
    const letters = await queue.getDeadLetterJobs()
    expect(letters).toHaveLength(1)
    expect(letters[0].id).not.toBe(originalLetter.id)
  })

  it('keeps independent workers and shared state when a queue client closes', async () => {
    const queue = new Queue(queueName('close'))
    const store = getOrCreateQueue(queue.name)
    workers.push(new Worker(queue.name, async (job: TestJob) => job.data))
    const before = await queue.add('before', { value: 1 })

    await queue.close()

    expect(await store.getWorkers()).toHaveLength(1)
    expect(await queue.getJob(before!.id)).toMatchObject({ returnvalue: { value: 1 } })
    const after = await new Queue(queue.name).add('after', { value: 2 })
    expect(await queue.getJob(after!.id)).toMatchObject({ returnvalue: { value: 2 } })
  })

  it('delegates dead-letter ownership, read options and replay to the native queue', async () => {
    const deadLetterQueue = { name: queueName('shared-dlq') }
    const first = new Queue(queueName('first'), { deadLetterQueue })
    const second = new Queue(queueName('second'), { deadLetterQueue })
    let failFirst = true
    workers.push(
      new Worker(
        first.name,
        async (job: TestJob) => {
          if (failFirst) throw new Error('first failure')
          return job.data
        },
        { deadLetterQueue },
      ),
      new Worker(
        second.name,
        async () => {
          throw new Error('second failure')
        },
        { deadLetterQueue },
      ),
    )
    await Promise.all([
      first.add('first', { value: 1 }, { expectDeadLetter: true }),
      second.add('second', { value: 2 }, { expectDeadLetter: true }),
    ])

    const [firstLetter] = await first.getDeadLetterJobs()
    const [secondLetter] = await second.getDeadLetterJobs()
    expect(await first.getDeadLetterJobs()).toHaveLength(1)
    expect(firstLetter.data).toMatchObject({ originalQueue: first.name, data: { value: 1 } })
    expect(await first.getDeadLetterJob(secondLetter.id)).toBeNull()
    expect(await first.removeDeadLetterJob(secondLetter.id)).toBe(false)
    expect(await first.replayDeadLetterJob(secondLetter.id)).toBeNull()
    expect((await first.getDeadLetterJobs(0, 9, { excludeData: true }))[0].data).toBeUndefined()

    failFirst = false
    const replayed = await first.replayDeadLetterJob(firstLetter.id)
    await first.waitForJobs([replayed], { timeout: 200 })
    expect(await first.getJob(replayed!.id)).toMatchObject({ returnvalue: { value: 1 } })
    expect(await first.getDeadLetterJobs()).toHaveLength(0)
    expect(await second.getDeadLetterJobs()).toHaveLength(1)
  })

  it('uses native cross-queue flows after producer clients have closed', async () => {
    const parents = new Queue(queueName('parents'))
    const children = new Queue(queueName('children'))
    await Promise.all([parents.close(), children.close()])
    const producer = new FlowProducer()
    const flow = await producer.add({
      name: 'parent',
      queueName: parents.name,
      data: {},
      children: [{ name: 'child', queueName: children.name, data: { value: 21 } }],
    })
    expect(flow).toMatchObject({ job: { name: 'parent' }, children: [{ job: { name: 'child' } }] })
    workers.push(
      new Worker(children.name, async (job: TestJob<{ value: number }>) => job.data.value * 2),
      new Worker(parents.name, async (job: TestJob) =>
        Object.values(await job.getChildrenValues()),
      ),
    )

    await parents.waitForJobs([flow.job], { timeout: 200 })
    expect(await parents.getJob(flow.job.id)).toMatchObject({ returnvalue: [42] })
    await producer.close()
  })
})
