import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Queue, QueueEvents, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  createWorker,
  workerQueueConnection,
  workerQueuePrefix,
} from '@data-stores/valkey-glide-mq'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

// A stall needs the claim idle for `stalledInterval` and the job lock (`lockDuration`) expired. A
// force-closed worker stops renewing both, so the next worker's scheduler counts one stall per
// abandoned run. Short values keep each recovery to a scan or two.
const RECOVERY = { lockDuration: 150, stalledInterval: 150, blockTimeout: 500, concurrency: 1 }
const STALL_FAILURE_REASON = 'job stalled more than maxStalledCount'

function createFixture() {
  const name = `factory_stall_budget_${randomUUID()}`
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  return {
    name,
    queue: new Queue(name, connection),
    events: new QueueEvents(name, { ...connection, blockTimeout: 500 }),
  }
}

// Runs the job until its worker is force-closed, which leaves it active for stalled recovery.
async function holdUntilForceClosed(job: Job): Promise<void> {
  await once(job.abortSignal!, 'abort')
}

describe.each([{ dedicatedCommandClient: false }, { dedicatedCommandClient: true }])(
  'createWorker stall budget (%o)',
  ({ dedicatedCommandClient }) => {
    it('recovers a job that stalls twice with the default maxStalledCount', async () => {
      const { name, queue, events } = createFixture()
      const runs: string[] = []
      const abandon = () => {
        const started = Promise.withResolvers<void>()
        const worker = createWorker(
          name,
          async job => {
            runs.push(job.id)
            started.resolve()
            await holdUntilForceClosed(job)
          },
          { ...RECOVERY, dedicatedCommandClient },
        )
        return { worker, started: started.promise }
      }
      let finisher: ReturnType<typeof createWorker> | undefined
      // A budget that is too small fails the job at the second stall; surface that as the failure
      // reason instead of waiting for a completion that can no longer happen.
      const failure = Promise.withResolvers<never>()
      failure.promise.catch(() => {})
      events.on('failed', ({ failedReason }) =>
        failure.reject(new Error(`Job failed: ${failedReason}`)),
      )

      try {
        await events.waitUntilReady()
        const job = await queue.add('hold', {}, { attempts: 1 })
        if (!job) throw new Error('Expected the stall test job')

        const first = abandon()
        await first.started
        await first.worker.close(true)

        const second = abandon()
        const secondStalled = once(second.worker, 'stalled')
        const [firstStalledId] = await secondStalled
        expect(firstStalledId).toBe(job.id)
        await second.started
        await second.worker.close(true)

        const completed = Promise.withResolvers<Job>()
        finisher = createWorker(
          name,
          async finishedJob => {
            runs.push(finishedJob.id)
          },
          { ...RECOVERY, dedicatedCommandClient },
        )
        finisher.once('completed', completedJob => completed.resolve(completedJob))
        const [secondStalledId] = await Promise.race([once(finisher, 'stalled'), failure.promise])
        expect(secondStalledId).toBe(job.id)
        expect((await Promise.race([completed.promise, failure.promise])).id).toBe(job.id)

        expect(runs).toEqual([job.id, job.id, job.id])
        expect(await (await queue.getJob(job.id))?.getState()).toBe('completed')
      } finally {
        await finisher?.close(true)
        await queue.obliterate({ force: true })
        await Promise.all([queue.close(), events.close()])
      }
    })
  },
)

describe('createWorker maxStalledCount override', () => {
  it('fails a job on its second stall when a worker lowers the budget to 1', async () => {
    const { name, queue, events } = createFixture()
    const failed = Promise.withResolvers<{ jobId: string; failedReason: string }>()
    events.on('failed', event => failed.resolve(event))
    const runs: string[] = []
    const budgetOne = { ...RECOVERY, maxStalledCount: 1 }
    const abandon = () => {
      const started = Promise.withResolvers<void>()
      const worker = createWorker(
        name,
        async job => {
          runs.push(job.id)
          started.resolve()
          await holdUntilForceClosed(job)
        },
        budgetOne,
      )
      return { worker, started: started.promise }
    }
    let recoverer: ReturnType<typeof createWorker> | undefined

    try {
      await events.waitUntilReady()
      const job = await queue.add('hold', {}, { attempts: 5 })
      if (!job) throw new Error('Expected the stall test job')

      const first = abandon()
      await first.started
      await first.worker.close(true)

      const second = abandon()
      await second.started
      await second.worker.close(true)

      recoverer = createWorker(
        name,
        async finishedJob => {
          runs.push(finishedJob.id)
        },
        budgetOne,
      )
      const failure = await failed.promise

      expect(failure).toMatchObject({ jobId: job.id, failedReason: STALL_FAILURE_REASON })
      expect(runs).toEqual([job.id, job.id])
      const failedJob = await queue.getJob(job.id)
      expect(await failedJob?.getState()).toBe('failed')
      expect(failedJob?.failedReason).toBe(STALL_FAILURE_REASON)
    } finally {
      await recoverer?.close(true)
      await queue.obliterate({ force: true })
      await Promise.all([queue.close(), events.close()])
    }
  })
})
