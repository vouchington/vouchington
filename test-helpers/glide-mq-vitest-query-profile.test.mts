import { describe, expect, it, onTestFinished, vi, type MockInstance } from 'vitest'
import { TestQueue, type TestJob } from 'glide-mq/testing'
import { Queue, Worker } from './glide-mq-vitest-shim.mts'
import { wrapTestWorkerProcessor, DEFAULT_FLUSH_TIMEOUT_MS } from './glide-mq-vitest-flush.mts'
import {
  createRequestQueryProfile,
  recordRequestQueryTiming,
  type WorkerQueryProfile,
} from '../backend/data-stores/psql/request-query-profile.mts'
import { takeRequestQueryProfileViolations } from '../backend/test-helpers/api/request-query-profile-violations.mts'

function own() {
  const workers: { close(): Promise<void> }[] = []
  const queues: { close(): Promise<void> }[] = []
  const jobs: { remove(): Promise<void> }[] = []
  const cleanups: (() => void)[] = []
  const actions: Promise<unknown>[] = []
  let closed = false
  onTestFinished(async () => {
    closed = true
    const failures: unknown[] = []
    let consumed = 0
    while (consumed < actions.length) {
      const batch = actions.slice(consumed)
      consumed = actions.length
      const results = await Promise.allSettled(batch)
      for (const result of results) if (result.status === 'rejected') failures.push(result.reason)
    }
    for (const close of [
      () => Promise.allSettled(workers.map(resource => resource.close())),
      () => Promise.allSettled(jobs.map(job => job.remove())),
      () => Promise.allSettled(queues.map(resource => resource.close())),
    ]) {
      const results = await close()
      for (const result of results) if (result.status === 'rejected') failures.push(result.reason)
    }
    for (const cleanup of cleanups) {
      try {
        cleanup()
      } catch (err) {
        failures.push(err)
      }
    }
    if (failures.length)
      throw new AggregateError(failures, 'Owned profile fixture cleanup failed', {
        cause: failures[0],
      })
  })
  return {
    workers,
    queues,
    jobs,
    cleanups,
    run<Result>(factory: () => Promise<Result>): Promise<Result> {
      if (closed) return Promise.reject(new Error('Owned profile fixture is closed'))
      const action = factory()
      actions.push(action)
      return action
    },
  }
}

describe('owned worker query profiles', () => {
  it('binds a real admitted job and all its timings to its owned profile', async () => {
    const owned = own()
    const queue = new Queue<{ value: number }, number>(`profile-${crypto.randomUUID()}`)
    owned.queues.push(queue)
    const worker = new Worker(queue, (job: TestJob<{ value: number }, number>) => {
      recordRequestQueryTiming({ durationMs: 0, annotation: 'actualAdapterProcessor' })
      return job.data.value
    })
    owned.workers.push(worker)
    const observed: WorkerQueryProfile[] = []
    owned.cleanups.push(
      worker.observeQueryProfiles(profile => {
        observed.push(profile)
        return undefined
      }),
    )
    const request = createRequestQueryProfile()
    const job = await request.run(() => owned.run(() => queue.add('owned', { value: 12 })))
    expect(job).not.toBeNull()
    expect(await job!.getState()).toBe('completed')
    expect((await owned.run(() => queue.getJob(job!.id)))?.returnvalue).toBe(12)
    expect(request.summarize().totalQueries).toBe(0)
    // Dispatch can inherit the worker's construction context instead of the admission scope.
    // The registered per-worker subscriber owns this actual invocation in either context.
    expect(observed).toHaveLength(1)
    expect(observed[0]!.summarize().totalQueries).toBe(1)
    expect(observed[0]!.identity).toEqual({
      queue: queue.name,
      jobs: [{ id: job!.id, name: 'owned' }],
    })
    expect(observed[0]!.queries()).toEqual([
      expect.objectContaining({ annotation: 'actualAdapterProcessor' }),
    ])
  })

  it('exposes a quiet outside-HTTP parent and its actual child job after owned settlement', async () => {
    const owned = own()
    owned.cleanups.push(() => vi.unstubAllEnvs())
    vi.stubEnv('VITEST_DIAGNOSTICS', '0')
    const parentQueue = new Queue<{ value: number }, number>(`parent-${crypto.randomUUID()}`)
    const childQueue = new Queue<{ value: number }, number>(`child-${crypto.randomUUID()}`)
    owned.queues.push(parentQueue, childQueue)
    const childWorker = new Worker(childQueue, (job: TestJob<{ value: number }, number>) => {
      recordRequestQueryTiming({ durationMs: 0, annotation: 'childProcessor' })
      return job.data.value
    })
    owned.workers.push(childWorker)
    let childJob: Awaited<ReturnType<typeof childQueue.add>> | undefined
    const parentWorker = new Worker(
      parentQueue,
      async (job: TestJob<{ value: number }, number>) => {
        recordRequestQueryTiming({ durationMs: 0, annotation: 'parentBefore' })
        childJob = await owned.run(() => childQueue.add('child', job.data))
        recordRequestQueryTiming({ durationMs: 0, annotation: 'parentAfter' })
        return job.data.value
      },
    )
    owned.workers.push(parentWorker)
    const observed: WorkerQueryProfile[] = []
    owned.cleanups.push(
      parentWorker.observeQueryProfiles(profile => {
        observed.push(profile)
        return undefined
      }),
    )
    const parent = await owned.run(() => parentQueue.add('parent', { value: 18 }))
    expect(childJob).toBeDefined()
    await owned.run(() =>
      childQueue.waitForJobs([childJob!], { timeout: DEFAULT_FLUSH_TIMEOUT_MS }),
    )
    expect((await owned.run(() => parentQueue.getJob(parent!.id)))?.returnvalue).toBe(18)
    expect(await childJob!.getState()).toBe('completed')
    expect(observed).toHaveLength(1)
    const root = observed[0]!
    expect(root.queries().map(query => query.annotation)).toEqual(['parentBefore', 'parentAfter'])
    expect(root.workerProfiles()).toHaveLength(1)
    const child = root.workerProfiles()[0]!
    expect(child.identity).toEqual({
      queue: childQueue.name,
      jobs: [{ id: childJob!.id, name: 'child' }],
    })
    expect(child.queries().map(query => query.annotation)).toEqual(['childProcessor'])
  })

  it('rejects a malformed batch member before invoking the processor beside a real admitted job', async () => {
    const owned = own()
    const queue = new TestQueue(`batch-${crypto.randomUUID()}`)
    owned.queues.push(queue)
    const job = await owned.run(() => queue.add('owned', { value: 1 }))
    if (job) owned.jobs.push(job)
    expect(job).not.toBeNull()
    // The positive sibling is a real public SDK receipt; no fake job ids or private registry reads.
    let started = false
    const processor = wrapTestWorkerProcessor(() => {
      started = true
      return 1
    }, queue.name)
    expect(() => processor([job, null])).toThrow('every batch member identity')
    expect(started).toBe(false)
  })

  it('continues profile owners after one listener throws without replacing the processor result', async () => {
    const owned = own()
    const queue = new Queue<{ value: number }, number>(`observer-${crypto.randomUUID()}`)
    owned.queues.push(queue)
    const worker = new Worker(queue, (job: TestJob<{ value: number }, number>) => {
      recordRequestQueryTiming({ durationMs: 0, annotation: 'listenerFaultProcessor' })
      return job.data.value
    })
    owned.workers.push(worker)
    const failure = new Error('owned profile observer failed')
    owned.cleanups.push(
      worker.observeQueryProfiles(() => {
        throw failure
      }),
    )
    const observed: WorkerQueryProfile[] = []
    owned.cleanups.push(
      worker.observeQueryProfiles(profile => {
        observed.push(profile)
        return undefined
      }),
    )
    const job = await owned.run(() => queue.add('owned', { value: 21 }))
    expect((await owned.run(() => queue.getJob(job!.id)))?.returnvalue).toBe(21)
    expect(observed).toHaveLength(1)
    expect(observed[0]!.queries()).toHaveLength(1)
    expect(observed[0]!.reportingFailures()).toEqual([
      { stage: 'profile-observer', reason: failure },
    ])
    expect(takeRequestQueryProfileViolations()).toEqual([
      'Independent worker query profile reporting failed',
    ])
  })

  it('retains a profile-output fault without replacing a completed business result', async () => {
    const owned = own()
    const queue = new Queue<{ value: number }, number>(`output-${crypto.randomUUID()}`)
    owned.queues.push(queue)
    const worker = new Worker(queue, (job: TestJob<{ value: number }, number>) => {
      recordRequestQueryTiming({ durationMs: 0, annotation: 'reportingFaultProcessor' })
      return job.data.value
    })
    owned.workers.push(worker)
    const observed: WorkerQueryProfile[] = []
    owned.cleanups.push(
      worker.observeQueryProfiles(profile => {
        observed.push(profile)
        return undefined
      }),
    )
    let stderr: MockInstance<typeof process.stderr.write> | undefined
    owned.cleanups.push(() => {
      stderr?.mockRestore()
      vi.unstubAllEnvs()
    })
    stderr = vi.spyOn(process.stderr, 'write')
    const failure = new Error('owned profile output unavailable')
    stderr.mockImplementation(() => {
      throw failure
    })
    vi.stubEnv('VITEST_DIAGNOSTICS', '1')
    const job = await owned.run(() => queue.add('owned', { value: 24 }))
    expect((await owned.run(() => queue.getJob(job!.id)))?.returnvalue).toBe(24)
    expect(observed[0]!.queries()).toHaveLength(1)
    expect(observed[0]!.reportingFailures()).toEqual([{ stage: 'profile-output', reason: failure }])
    expect(takeRequestQueryProfileViolations()).toEqual([
      'Independent worker query profile reporting failed',
    ])
  })
})
