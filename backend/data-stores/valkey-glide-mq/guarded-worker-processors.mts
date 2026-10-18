import { AsyncLocalStorage } from 'node:async_hooks'
import type { BatchProcessor, Job, JobOptions, Processor, WorkerOptions } from 'glide-mq'
import onError from '@modules/on-error'
import { withScheduledRunLease } from './scheduled-run-lease.mts'

type ActiveJob = { queue: string; jobId: string; dedupId?: string }
const activeJobs = new AsyncLocalStorage<ActiveJob[]>()
type LeaseOptions = Pick<WorkerOptions, 'lockDuration' | 'maxStalledCount' | 'prefix'>

export function wrapSingleProcessor<D, R>(
  queue: string,
  processor: Processor<D, R>,
  options: LeaseOptions,
): Processor<D, R> {
  return job => runJob(queue, job, processor, options)
}

export function wrapBatchProcessor<D, R>(
  queue: string,
  processor: BatchProcessor<D, R>,
  options: LeaseOptions,
): BatchProcessor<D, R> {
  return async jobs => {
    const releases: Array<() => Promise<void>> = []
    const runnable: Job<D, R>[] = []
    try {
      for (const job of jobs) {
        // oxlint-disable-next-line no-await-in-loop -- preserve batch order when two jobs share a scheduler lease
        const release = await withScheduledRunLease(queue, job, options)
        if (release) {
          releases.push(release)
          runnable.push(job)
        }
      }
      const values = runnable.length
        ? await activeJobs.run(
            runnable.map(job => activeJob(queue, job)),
            () => processor(runnable),
          )
        : []
      const result = jobs.map(job => {
        const index = runnable.indexOf(job)
        return index < 0 ? (undefined as R) : values[index]!
      })
      await releaseAfterFailure(releases)
      return result
    } catch (err) {
      await releaseAfterFailure(releases)
      throw err
    }
  }
}

async function runJob<D, R>(
  queue: string,
  job: Job<D, R>,
  processor: Processor<D, R>,
  options: LeaseOptions,
): Promise<R> {
  const release = await withScheduledRunLease(queue, job, options)
  if (!release) return undefined as R
  try {
    const result = await activeJobs.run([activeJob(queue, job)], () => processor(job))
    await releaseAfterFailure([release])
    return result
  } catch (err) {
    await releaseAfterFailure([release])
    throw err
  }
}

async function releaseAfterFailure(releases: Array<() => Promise<void>>): Promise<void> {
  const results = await Promise.allSettled(releases.map(release => release()))
  for (const result of results) {
    if (result.status !== 'rejected') continue
    try {
      onError(result.reason)
    } catch (err) {
      // Diagnostics must not replace the original processor or lease error.
      console.error('scheduled_lease_release_reporting_failed', err)
    }
  }
}

function activeJob(queue: string, job: Job): ActiveJob {
  return { queue, jobId: job.id, dedupId: job.opts.deduplication?.id }
}

export function rejectSelfAdd(queue: string, jobName: string, opts?: JobOptions): boolean {
  const active = activeJobs
    .getStore()
    ?.find(
      job =>
        job.queue === queue &&
        ((opts?.jobId && opts.jobId === job.jobId) ||
          (opts?.deduplication?.id && opts.deduplication.id === job.dedupId)),
    )
  if (!active) return false
  const error: Error & { extra?: Record<string, unknown> } = new Error(
    `Job ${active.jobId} tried to add itself to queue ${queue}`,
  )
  error.extra = {
    queue,
    jobName,
    jobId: opts?.jobId ?? null,
    dedupId: opts?.deduplication?.id ?? null,
    activeJobId: active.jobId,
    activeDedupId: active.dedupId ?? null,
  }
  if (process.env.NODE_ENV !== 'production') throw error
  onError(error)
  return true
}
