import { BatchError, type Job } from 'glide-mq'

// Runs the batch concurrently and, when any job fails, reports per-job outcomes through BatchError
// so GlideMQ retries or fails only the jobs that threw instead of the whole batch.
export async function processBatchSettled<R>(jobs: Job[], runOne: (job: Job) => Promise<R>) {
  const settled = await Promise.allSettled(
    jobs.map(job => Promise.resolve().then(() => runOne(job))),
  )
  const results = settled.map(r =>
    r.status === 'fulfilled'
      ? r.value
      : r.reason instanceof Error
        ? r.reason
        : new Error(String(r.reason)),
  )
  if (settled.some(r => r.status === 'rejected')) throw new BatchError(results)
  return results
}
