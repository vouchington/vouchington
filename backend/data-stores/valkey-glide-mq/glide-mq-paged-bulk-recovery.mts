import type { Queue } from 'glide-mq'
import { enqueueBulkReactivatingFinished } from './enqueue-or-reactivate.mts'
import { retryTransientEnqueue } from './glide-mq-retry.mts'
import { isPagedDispatchRow } from './paged-dispatch-context.mts'

type BulkQueue = Pick<Queue, 'addBulk'> & { readonly name?: string }
type BulkJobs = Parameters<Queue['addBulk']>[0]

/** Recover retained hard IDs only for rows admitted inside their matching dispatch page. */
export function enqueueBulkRows(
  queue: BulkQueue,
  queueName: string,
  jobs: BulkJobs,
  options: { prefix?: string; retry?: boolean },
): ReturnType<Queue['addBulk']> {
  const enqueue = (rows: BulkJobs) =>
    options.retry !== false ? retryTransientEnqueue(() => queue.addBulk(rows)) : queue.addBulk(rows)
  if (!isPagedDispatchRow(queueName)) return enqueue(jobs)
  return enqueueBulkReactivatingFinished({
    queue: { name: queue.name ?? queueName },
    prefix: options.prefix,
    inputs: jobs,
    jobIdOf: job => job.opts?.jobId,
    enqueueBulk: enqueue,
  })
}
