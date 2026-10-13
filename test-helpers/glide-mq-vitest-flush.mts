import {
  runIndependentWorker,
  type WorkerQueryProfile,
} from '../backend/data-stores/psql/request-query-profile.mts'
import { recordRequestQueryProfileViolation } from '../backend/test-helpers/api/request-query-profile-violations.mts'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { JobOptions } from 'glide-mq'
import type { TestJob } from 'glide-mq/testing'
import { TestQueueFlushTimeoutError } from './glide-mq-vitest-flush-diagnostics.mts'
import { type FlushQueue, flushJobs } from './glide-mq-vitest-flush-wait.mts'
export { TestQueueFlushTimeoutError }
export { DEFAULT_FLUSH_TIMEOUT_MS } from './glide-mq-vitest-flush-wait.mts'

const testWorkerProcessorContext = new AsyncLocalStorage<true>()

/** Suppress automatic flushing for nested processors and native explicit-wait/replay APIs. */
export function runInsideTestWorkerProcessor<T>(fn: () => T): T {
  return testWorkerProcessorContext.run(true, fn)
}

export function isInsideTestWorkerProcessor(): boolean {
  return testWorkerProcessorContext.getStore() === true
}

export function wrapTestWorkerProcessor<R>(
  processor: (job: any) => Promise<R> | R,
  queue: string,
  observe?: (profile: WorkerQueryProfile) => undefined,
): (job: any) => Promise<R> {
  return job => {
    const worker = runIndependentWorker(
      { queue, jobs: workerQueryIdentities(job) },
      () => runInsideTestWorkerProcessor(() => Promise.resolve(processor(job))),
      profile => {
        observe?.(profile)
        return undefined
      },
    )
    const finish = () => {
      if (
        worker.profile
          .reportingFailures()
          .some(failure => failure.stage.startsWith('profile-owner'))
      ) {
        publishWorkerProfileViolation(worker.profile)
      }
      reportWorkerProfile(worker.profile)
    }
    return (async () => {
      try {
        const result = await worker.completion
        finish()
        return result
      } catch (err) {
        finish()
        throw err
      }
    })()
  }
}

/** @public The canonical adapter records operational faults without replacing processor outcomes. */
export function recordWorkerProfileFailure(
  profile: WorkerQueryProfile,
  stage: string,
  reason: unknown,
): void {
  profile.reportFailure(stage, reason)
  publishWorkerProfileViolation(profile)
}

function publishWorkerProfileViolation(profile: WorkerQueryProfile): void {
  try {
    recordRequestQueryProfileViolation('Independent worker query profile reporting failed')
  } catch (err) {
    profile.reportFailure('violation-collector', err)
  }
}

export type TestJobOptions = JobOptions & {
  expectDeadLetter?: boolean
  flushTimeoutMs?: number
}

function stripTestJobOptions(opts?: TestJobOptions): JobOptions | undefined {
  if (!opts) return undefined
  const { expectDeadLetter: _expectDeadLetter, flushTimeoutMs: _flushTimeoutMs, ...jobOpts } = opts
  return jobOpts
}

export async function addAndFlush<D, R>(
  queue: FlushQueue<D, R>,
  name: string,
  data: D,
  opts?: TestJobOptions,
) {
  const job = await queue.enqueue(name, data, stripTestJobOptions(opts))
  if (job && !isInsideTestWorkerProcessor()) {
    await flushJobs(
      queue,
      [job],
      opts?.expectDeadLetter === true ? new Set([job.id]) : new Set(),
      opts?.flushTimeoutMs,
    )
  }
  return job
}

export async function addBulkAndFlush<D, R>(
  queue: FlushQueue<D, R>,
  jobs: Array<{ name: string; data: D; opts?: TestJobOptions }>,
) {
  // Keep per-input test options attached to admitted ids while returning the SDK's compact list.
  const result: TestJob<D, R>[] = []
  const expectedDeadLetterJobIds = new Set<string>()
  for (const job of jobs) {
    const added = await queue.enqueue(job.name, job.data, stripTestJobOptions(job.opts))
    if (!added) continue
    result.push(added)
    if (job.opts?.expectDeadLetter === true) expectedDeadLetterJobIds.add(added.id)
  }
  const timeouts = jobs.flatMap(job =>
    typeof job.opts?.flushTimeoutMs === 'number' ? [job.opts.flushTimeoutMs] : [],
  )
  if (result.length > 0 && !isInsideTestWorkerProcessor()) {
    await flushJobs(
      queue,
      result,
      expectedDeadLetterJobIds,
      timeouts.length > 0 ? Math.max(...timeouts) : undefined,
    )
  }
  return result
}

function workerQueryIdentities(input: unknown): { id: string; name: string }[] {
  const jobs: unknown[] = Array.isArray(input) ? input : [input]
  if (jobs.length === 0) throw new Error('Test worker profiles require every batch member identity')
  return jobs.map(job => {
    if (
      !job ||
      typeof job !== 'object' ||
      !('id' in job) ||
      !('name' in job) ||
      typeof job.id !== 'string' ||
      !job.id ||
      typeof job.name !== 'string' ||
      !job.name
    ) {
      throw new Error('Test worker profiles require every batch member identity')
    }
    return { id: job.id, name: job.name }
  })
}

function workerProfileSnapshot(profile: WorkerQueryProfile): unknown {
  return {
    identity: profile.identity,
    queries: profile.queries(),
    summary: profile.summarize(),
    reportingFailureStages: profile.reportingFailures().map(failure => failure.stage),
    children: profile.workerProfiles().map(workerProfileSnapshot),
  }
}

function reportWorkerProfile(profile: WorkerQueryProfile): void {
  try {
    const summary = profile.summarize()
    if (
      process.env.VITEST_DIAGNOSTICS !== '1' &&
      summary.repeats.length === 0 &&
      profile.reportingFailures().length === 0
    )
      return
    process.stderr.write(
      `${JSON.stringify({
        kind: 'pg-worker-profile',
        pid: process.pid,
        ...{ profile: workerProfileSnapshot(profile) },
      })}\n`,
    )
  } catch (err) {
    recordWorkerProfileFailure(profile, 'profile-output', err)
  }
}
