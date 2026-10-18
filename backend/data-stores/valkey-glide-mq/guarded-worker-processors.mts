import { AsyncLocalStorage } from 'node:async_hooks'
import type { BatchProcessor, Job, JobOptions, Processor, WorkerOptions } from 'glide-mq'
import onError from '@modules/on-error'
import { withScheduledRunLease } from './scheduled-run-lease.mts'

type ActiveJob = { queue: string; jobId: string; dedupId?: string }
const activeJobs = new AsyncLocalStorage<ActiveJob[]>()
type LeaseOptions = Pick<WorkerOptions, 'lockDuration' | 'maxStalledCount'>

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
      return jobs.map(job => {
        const index = runnable.indexOf(job)
        return index < 0 ? (undefined as R) : values[index]!
      })
    } finally {
      await Promise.all(releases.map(release => release()))
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
    return await activeJobs.run([activeJob(queue, job)], () => processor(job))
  } finally {
    await release()
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
  const error = Object.assign(
    new Error(`Job ${active.jobId} tried to add itself to queue ${queue}`),
    {
      extra: {
        queue,
        jobName,
        jobId: opts?.jobId ?? null,
        dedupId: opts?.deduplication?.id ?? null,
        activeJobId: active.jobId,
        activeDedupId: active.dedupId ?? null,
      },
    },
  )
  if (process.env.NODE_ENV !== 'production') throw error
  onError(error)
  return true
}
