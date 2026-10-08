import { AsyncLocalStorage } from 'node:async_hooks'
import type { Job } from 'glide-mq'
import { vi } from 'vitest'

export async function withOwnedVouchStats<Result>(targetId: string, action: () => Promise<Result>) {
  const retry = await import('../data-stores/valkey-glide-mq/glide-mq-retry.mts')
  const queue = (await import('../queues/elections/queues.mts')).elections
  const worker = (await import('../workers/elections/workers.mts')).elections
  type Admission = { jobs?: Promise<unknown>; owned: boolean }
  type End = { failed: boolean; reason?: unknown }
  const context = new AsyncLocalStorage<Admission>()
  const admissions: Admission[] = []
  const ends = new Map<string, End>()
  const waiters = new Map<string, (end: End) => void>()
  const failures: unknown[] = []
  const ownedJobs = new Map<string, Job>()
  const stateReads = new Set<Promise<void>>()
  const attemptDiagnostics: Array<{ jobId: string; reason: unknown }> = []
  let observationExpired = false
  let sdkFailed = false
  let deadline: AbortSignal | undefined
  const owns = (job: Job | undefined) =>
    job?.name === 'processUpdateElectionVoteStats' &&
    job.data.orderingKey === 'user_vouch' &&
    job.data.electionId === targetId
  const terminal = (job: Job | undefined, failed: boolean, reason?: unknown) => {
    if (!owns(job) || !job?.id) return
    const key = `elections:${job.id}`
    const end = { failed, reason }
    ends.set(key, end)
    waiters.get(key)?.(end)
    waiters.delete(key)
  }
  const completed = (job: Job) => terminal(job, false)
  const failed = (job: Job | undefined, error: Error) => {
    if (!owns(job) || !job?.id) return
    attemptDiagnostics.push({ jobId: job.id, reason: error })
    ownedJobs.set(job.id, job)
    // failed describes attempts too. One event-caused real state read distinguishes retries.
    const reading = job
      .getState()
      .then(state => {
        if (state === 'failed') terminal(job, true, error)
        else if (state === 'completed') terminal(job, false)
        return undefined
      })
      .catch(err => {
        failures.push(err)
      })
    stateReads.add(reading)
    void reading.finally(() => stateReads.delete(reading))
  }
  const active = (job: Job) => {
    if (owns(job) && job.id) ownedJobs.set(job.id, job)
  }
  const sdkError = (err: unknown) => {
    sdkFailed = true
    failures.push(err)
  }
  const unfinished = () => [...ownedJobs.keys()].filter(id => !ends.has(`elections:${id}`))
  const bounded = <Value,>(promise: Promise<Value>): Promise<Value> => {
    const signal = deadline!
    return new Promise((resolve, reject) => {
      const expired = () => {
        observationExpired = true
        reject(
          new Error(
            `User-vouch observation expired; unfinished owned job IDs: ${unfinished().join(', ')}; pending state reads: ${stateReads.size}. Native work was not cancelled or drained.`,
          ),
        )
      }
      signal.addEventListener('abort', expired, { once: true })
      void promise.then(
        value => {
          signal.removeEventListener('abort', expired)
          resolve(value)
        },
        err => {
          signal.removeEventListener('abort', expired)
          reject(
            err instanceof Error ? err : new Error('Native observation failed', { cause: err }),
          )
        },
      )
      if (signal.aborted) expired()
    })
  }
  const wait = (id: string) => {
    const key = `elections:${id}`
    const known = ends.get(key)
    if (known) return Promise.resolve(known)
    return bounded(new Promise<End>(resolve => waiters.set(key, resolve)))
  }
  const retryReal = retry.retryTransientEnqueue
  const bulkReal = queue.addBulk
  let retrySpy: ReturnType<typeof vi.spyOn> | undefined
  let bulkSpy: ReturnType<typeof vi.spyOn> | undefined
  let result: Result | undefined
  try {
    worker.on('active', active)
    worker.on('completed', completed)
    worker.on('failed', failed)
    worker.on('error', sdkError)
    const acquiredRetrySpy = vi.spyOn(retry, 'retryTransientEnqueue')
    retrySpy = acquiredRetrySpy
    acquiredRetrySpy.mockImplementation(fn => {
      const item: Admission = { owned: false }
      const jobs = context.run(item, () => retryReal(fn))
      item.jobs = jobs
      void jobs.catch(() => undefined)
      return jobs
    })
    const acquiredBulkSpy = vi.spyOn(queue, 'addBulk')
    bulkSpy = acquiredBulkSpy
    acquiredBulkSpy.mockImplementation(jobs => {
      const item = context.getStore()
      if (item && jobs.some(job => owns(job as Job)) && !item.owned) {
        item.owned = true
        admissions.push(item)
      }
      return Reflect.apply(bulkReal, queue, [jobs])
    })
    try {
      result = await action()
    } catch (err) {
      failures.push(err)
    }
    if (!admissions.length && !failures.length)
      failures.push(new Error('No actual owned user-vouch admission observed'))
  } catch (err) {
    failures.push(err)
  }
  {
    // First settle actual producer/admission promises. Retry has three saturation-only attempts;
    // it does not impose a worst-case timeout on the underlying native operation.
    try {
      for (const item of admissions) {
        try {
          const jobs = await item.jobs
          if (!Array.isArray(jobs)) throw new Error('Owned admission did not return job array')
          for (const job of jobs as Array<Job | null>) {
            if (job === null) {
              if (!ownedJobs.size) throw new Error('Deduplication lacks a real prior owned job')
            } else if (!job || !owns(job) || !job.id) {
              throw new Error('Admission returned an unexpected or unidentified owned job')
            } else ownedJobs.set(job.id, job)
          }
        } catch (err) {
          failures.push(err)
        }
      }
      // Bound terminal OBSERVATION after admissions settle, without closing the shared worker.
      deadline = AbortSignal.timeout(25_000)
      const observed = await Promise.allSettled(
        [...ownedJobs.values()].map(async job => {
          const end = await wait(job.id)
          if (end.failed) throw end.reason
        }),
      )
      for (const item of observed) if (item.status === 'rejected') failures.push(item.reason)
      try {
        await bounded(Promise.all([...stateReads]))
      } catch (err) {
        failures.push(err)
      }
      if (unfinished().length)
        failures.push(
          new Error(
            `Unfinished owned native jobs: ${unfinished().join(', ')}. Canonical worker teardown owns remaining work; this observer did not cancel or drain it.`,
          ),
        )
    } finally {
      // Admissions have settled. Always remove this case's observers/spies, including expiry.
      // An expired observation is FAILURE, not evidence that remaining native jobs drained.
      for (const cleanup of [
        () => worker.off('active', active),
        () => worker.off('completed', completed),
        () => worker.off('failed', failed),
        () => worker.off('error', sdkError),
        () => retrySpy?.mockRestore(),
        () => bulkSpy?.mockRestore(),
      ]) {
        try {
          cleanup()
        } catch (err) {
          failures.push(err)
        }
      }
    }
  }
  if (observationExpired || sdkFailed) {
    for (const diagnostic of attemptDiagnostics) failures.push(diagnostic.reason)
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, 'Owned vote work failed')
  return result as Result
}
