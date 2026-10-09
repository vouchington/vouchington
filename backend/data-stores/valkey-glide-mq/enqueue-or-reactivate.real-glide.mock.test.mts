import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job, type JobOptions } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from './enqueue-or-reactivate.mts'

// The dedicated backend-real-glide-mq project routes only .real-glide.mock.test.mts files, and
// retained-record behavior is a property of the real GlideMQ transport, not the in-memory shim.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

type Payload = { id: string; delayMs?: number; grouped?: boolean }

describe('reactivating finished job records through real GlideMQ', () => {
  it('re-adds ids held by a completed or failed record and leaves a live job alone', async () => {
    const failing = new Set<string>()
    const runs = new Map<string, number>()
    const harness = openHarness(async job => {
      runs.set(job.data.id, (runs.get(job.data.id) ?? 0) + 1)
      if (failing.has(job.data.id)) throw new Error('expected terminal job failure')
    })
    const completed = { id: randomUUID() }
    const failed = { id: randomUUID() }
    const live = { id: randomUUID(), delayMs: 60_000 }
    const fresh = { id: randomUUID() }

    try {
      failing.add(failed.id)
      const firstRuns = [harness.settled(completed.id), harness.settled(failed.id)]
      await harness.add(completed)
      await harness.add(failed)
      await harness.add(live)
      await Promise.all(firstRuns)
      const liveBefore = await harness.queue.getJob(live.id)
      await expect(liveBefore?.getState()).resolves.toBe('delayed')
      failing.delete(failed.id)

      const reactivatedRuns = [
        harness.settled(completed.id),
        harness.settled(failed.id),
        harness.settled(fresh.id),
      ]
      const added = await enqueueBulkReactivatingFinished({
        queue: harness.queue,
        inputs: [completed, failed, live, fresh],
        jobIdOf: input => input.id,
        enqueueBulk: harness.addBulk,
      })
      await Promise.all(reactivatedRuns)

      expect(added.map(job => job.id).toSorted()).toEqual(
        [completed.id, failed.id, fresh.id].toSorted(),
      )
      expect([completed.id, failed.id, fresh.id].map(id => runs.get(id))).toEqual([2, 2, 1])
      const liveAfter = await harness.queue.getJob(live.id)
      await expect(liveAfter?.getState()).resolves.toBe('delayed')
      expect(liveAfter?.timestamp).toBe(liveBefore?.timestamp)
      expect(runs.has(live.id)).toBe(false)
    } finally {
      await harness.close()
    }
  })

  it('keeps an ordering group serialized when it reactivates a finished ordered job', async () => {
    const held = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const runs = new Map<string, number>()
    let inGroup = 0
    let mostInGroup = 0
    const harness = openHarness(async job => {
      runs.set(job.data.id, (runs.get(job.data.id) ?? 0) + 1)
      if (!job.data.grouped) return
      mostInGroup = Math.max(mostInGroup, ++inGroup)
      try {
        if (job.data.id !== 'holder') return
        held.resolve()
        await release.promise
      } finally {
        inGroup--
      }
    })
    const finished = { id: randomUUID(), grouped: true }
    const sibling = { id: randomUUID() }

    try {
      const firstRun = harness.settled(finished.id)
      await harness.add(finished)
      await firstRun
      await harness.add({ id: 'holder', grouped: true })
      await held.promise

      const reactivatedRun = harness.settled(finished.id)
      await enqueueBulkReactivatingFinished({
        queue: harness.queue,
        inputs: [finished],
        jobIdOf: input => input.id,
        enqueueBulk: harness.addBulk,
      })
      // The sibling queues behind the reactivated job, so once it ran the worker has already met
      // the reactivated job while the holder owned the group's only slot.
      const siblingRun = harness.settled(sibling.id)
      await harness.add(sibling)
      await siblingRun
      expect(runs.get(finished.id)).toBe(1)

      release.resolve()
      await reactivatedRun
      expect(runs.get(finished.id)).toBe(2)
      expect(mostInGroup).toBe(1)
    } finally {
      release.resolve()
      await harness.close()
    }
  })
})

/** An isolated queue and worker that replay a stable-id, retained-record job configuration. */
function openHarness(processor: (job: Job<Payload>) => Promise<void>) {
  const queueName = `enqueue_or_reactivate_${randomUUID()}`
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const queue = new Queue<Payload>(queueName, connection)
  // A graceful close waits out the worker's in-flight blocking read, so keep that read short.
  const worker = new Worker<Payload>(queueName, processor, {
    ...connection,
    blockTimeout: 1000,
    concurrency: 2,
  })
  worker.on('error', () => undefined)
  const waiting = new Map<string, PromiseWithResolvers<void>>()
  const noteSettled = (job: Job<Payload> | undefined) => {
    if (job) waiting.get(job.id)?.resolve()
  }
  worker.on('completed', noteSettled)
  worker.on('failed', noteSettled)
  const options = (input: Payload): JobOptions => ({
    jobId: input.id,
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
    deduplication: { id: input.id, mode: 'simple' },
    ...(input.delayMs ? { delay: input.delayMs } : {}),
    ...(input.grouped ? { ordering: { key: 'group', concurrency: 1 } } : {}),
  })
  return {
    queue,
    add: (input: Payload) => queue.add('work', input, options(input)),
    addBulk: (inputs: Payload[]) =>
      queue.addBulk(inputs.map(input => ({ name: 'work', data: input, opts: options(input) }))),
    /** Register before enqueueing so the worker's next terminal event for this id cannot be missed. */
    settled: (id: string) => {
      const next = Promise.withResolvers<void>()
      waiting.set(id, next)
      return next.promise
    },
    close: async () => {
      try {
        await worker.close()
      } finally {
        try {
          await queue.obliterate({ force: true })
        } finally {
          await queue.close()
        }
      }
    },
  }
}
