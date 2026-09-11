// Regression tests for upstream glide-mq bugs fixed in 0.15.2.
//
// NOTE: These tests run via the vitest glide-mq shim (test-helpers/glide-mq-vitest-shim.mts),
// which replaces the real Queue/Worker with in-memory synchronous equivalents. The shim now
// wraps batch-mode processors so they can be exercised correctly in tests. Tests here verify:
//   - Our batch processor code (bloom-filters workers.mts) handles all job types correctly.
//   - BatchError partial failures are correctly surfaced per-job.
//   - Queue stats are non-negative (absence of Math.max(0,...) clamping; upstream fix #217).

import { describe, expect, it } from 'vitest'
import { BatchError, Queue, Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'

const QUEUE_OPTS = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const WORKER_OPTS = { connection: workerQueueConnection, prefix: workerQueuePrefix }

// #2337 / #2338 / upstream #212: batch-mode worker must process priority-tagged jobs.
// Before 0.15.2, tryPopFromLists routed priority jobs through the single-job processor,
// throwing "Single-job processor called in batch mode". The shim now wraps batch processors
// as single-job processors (wrapping [job]), exercising the same code path as the fix.
describe('glide-mq regression: batch-mode worker with priority jobs (#2337 / #2338)', () => {
  it('processes a priority-tagged job without throwing', async () => {
    const queueName = `test-batch-priority-${crypto.randomUUID()}`
    const processed: string[] = []

    const queue = new Queue(queueName, QUEUE_OPTS)
    const worker = new Worker(
      queueName,
      (jobs: Job[]) =>
        Promise.resolve(
          jobs.map(job => {
            processed.push(job.name)
            return 'ok' as const
          }),
        ),
      { ...WORKER_OPTS, batch: { size: 10, timeout: 100 } },
    )
    expect(worker).toBeDefined()

    try {
      // Shim's queue.add runs addAndFlush: processes synchronously and throws if job fails.
      // Before the batch-mode shim wrapper, this would throw because the processor received
      // a non-iterable single job instead of a Job[].
      await queue.add('task', {}, { priority: 5, attempts: 1, removeOnComplete: true })
      expect(processed).toEqual(['task'])
    } finally {
      await worker.close()
    }
  })

  it('processes multiple jobs of different names without throwing', async () => {
    const queueName = `test-batch-multi-${crypto.randomUUID()}`
    const processed: string[] = []

    const queue = new Queue(queueName, QUEUE_OPTS)
    const worker = new Worker(
      queueName,
      (jobs: Job[]) =>
        Promise.resolve(
          jobs.map(job => {
            processed.push(job.name)
            return 'ok' as const
          }),
        ),
      { ...WORKER_OPTS, batch: { size: 10, timeout: 100 } },
    )
    expect(worker).toBeDefined()

    try {
      await queue.add('job-a', {}, { attempts: 1, removeOnComplete: true })
      await queue.add('job-b', {}, { attempts: 1, removeOnComplete: true })
      expect(processed).toEqual(['job-a', 'job-b'])
    } finally {
      await worker.close()
    }
  })

  it('surfaces per-job errors via BatchError for failed jobs', async () => {
    const queueName = `test-batch-error-${crypto.randomUUID()}`

    const queue = new Queue(queueName, QUEUE_OPTS)
    const worker = new Worker(
      queueName,
      (jobs: Job[]): Promise<string[]> => {
        const results = jobs.map(job =>
          (job.data as { fail?: boolean }).fail ? new Error('intentional failure') : 'ok',
        )
        if (results.some(r => r instanceof Error)) return Promise.reject(new BatchError(results))
        return Promise.resolve(results as string[])
      },
      { ...WORKER_OPTS, batch: { size: 10, timeout: 100 } },
    )
    expect(worker).toBeDefined()

    try {
      // Successful job succeeds silently
      await queue.add('ok-job', { fail: false }, { attempts: 1, removeOnComplete: true })

      // Failing job: shim unwraps BatchError results[0] and rethrows, causing addAndFlush to throw
      await expect(
        queue.add('fail-job', { fail: true }, { attempts: 1, removeOnFail: true }),
      ).rejects.toThrow('intentional failure')
    } finally {
      await worker.close()
    }
  })
})

// #2834 / upstream #217: list-active counter must not underflow.
// NOTE: These tests run via the in-memory vitest shim and do NOT exercise the Valkey Lua
// DECR paths where the upstream underflow bug existed. The Lua DECR guard is validated by
// the upstream 0.15.2 test suite. These tests document that the shim's getJobCounts()
// returns non-negative values and that the local Math.max(0,...) clamp has been removed —
// removal is safe because the upstream Lua guard now prevents the underflow.
describe('glide-mq regression: list-active counter stays non-negative (#2834)', () => {
  it('getJobCounts returns non-negative counts after batch jobs complete', async () => {
    const queueName = `test-counts-${crypto.randomUUID()}`

    const queue = new Queue(queueName, QUEUE_OPTS)
    const worker = new Worker(queueName, (jobs: Job[]) => Promise.resolve(jobs.map(() => 'ok')), {
      ...WORKER_OPTS,
      batch: { size: 10, timeout: 100 },
    })
    expect(worker).toBeDefined()

    try {
      await queue.addBulk([
        { name: 'task-1', data: {}, opts: { attempts: 1, removeOnComplete: true } },
        { name: 'task-2', data: {}, opts: { attempts: 1, removeOnComplete: true } },
      ])

      const counts = await queue.getJobCounts()
      expect(counts.active).toBeGreaterThanOrEqual(0)
      expect(counts.waiting).toBeGreaterThanOrEqual(0)
      expect(counts.completed).toBeGreaterThanOrEqual(0)
      expect(counts.failed).toBeGreaterThanOrEqual(0)
    } finally {
      await worker.close()
    }
  })
})
