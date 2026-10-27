import type { Job, Queue } from 'glide-mq'
import pMap from 'p-map'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { createRetryingCommandClient } from './glide-mq-command-client.mts'
import { acquireTerminalJobRemoval } from './terminal-job-removal.mts'

type JobLookupQueue = Pick<Queue, 'name'>

/**
 * Adds `inputs` through `enqueueBulk`, then adds again the ones whose custom job id was held only
 * by a finished record.
 *
 * A custom `jobId` is a hard uniqueness key: GlideMQ skips the entry, returning no job for it,
 * while any record with that id exists. That includes a retained completed or failed record
 * (`removeOnComplete`/`removeOnFail` count or age). `removeOnFail: true` deletes the record on
 * terminal failure, including a stall past the limit. A durable dispatcher that re-adds an attempt whose
 * token did not change would then be skipped on every pass.
 *
 * A skipped id is released only when its record is completed or failed, or already gone. WATCH on
 * the native job hash fences the state check and native removal against a concurrent retry or
 * re-admission. A conflict skips this pass; the durable source will offer the row again. A waiting,
 * prioritized, delayed, or active job is the canonical delivery and is never touched. The caller's
 * recovery page bounds the sequential lookups on one dedicated command connection.
 */
export async function enqueueBulkReactivatingFinished<
  TInput,
  TJob extends Pick<Job, 'id'>,
>(options: {
  queue: JobLookupQueue
  inputs: TInput[]
  jobIdOf: (input: TInput) => string | undefined
  enqueueBulk: (inputs: TInput[]) => Promise<TJob[]>
  /** Rebuild an app-specific payload from the terminal record removed by this pass. */
  reactivatedInput?: (input: TInput, retainedData: unknown) => TInput
  /** Isolated real queues in tests may override the production queue namespace. */
  prefix?: string
}): Promise<TJob[]> {
  const { queue, inputs, jobIdOf, enqueueBulk } = options
  const added = await enqueueBulk(inputs)
  const addedIds = new Set(added.map(job => job.id))
  const skipped = inputs
    .map(input => ({ input, jobId: jobIdOf(input) }))
    .filter((entry): entry is { input: TInput; jobId: string } =>
      entry.jobId === undefined ? false : !addedIds.has(entry.jobId),
    )
  if (skipped.length === 0) return added

  const released = await releaseFinishedJobIds(
    queue.name,
    options.prefix ?? workerQueuePrefix ?? 'glide',
    skipped.map(entry => entry.jobId),
    options.reactivatedInput !== undefined,
  )
  const reactivated = skipped.flatMap(entry => {
    if (!released.has(entry.jobId)) return []
    const retainedData = released.get(entry.jobId)
    return [
      retainedData === undefined || options.reactivatedInput === undefined
        ? entry.input
        : options.reactivatedInput(entry.input, retainedData),
    ]
  })
  if (reactivated.length === 0) return added
  return [...added, ...(await enqueueBulk(reactivated))]
}

async function releaseFinishedJobIds(
  queueName: string,
  prefix: string,
  jobIds: string[],
  preserveData: boolean,
): Promise<Map<string, unknown>> {
  const released = new Map<string, unknown>()
  const namespace = `${prefix}:{${queueName}}`
  const dedicated = createRetryingCommandClient('terminal-job-reactivation')
  const client = dedicated.client
  try {
    await pMap(
      jobIds,
      async jobId => {
        const claim = await acquireTerminalJobRemoval(client, namespace, jobId)
        if (claim.state === 'terminal') {
          const data = preserveData ? await claim.readData() : null
          const retainedData = data === null ? undefined : (JSON.parse(data.toString()) as unknown)
          if (await claim.remove()) released.set(jobId, retainedData)
        } else {
          if (claim.state === 'missing') released.set(jobId, undefined)
          await claim.release()
        }
      },
      { concurrency: 1 },
    )
  } finally {
    await dedicated.close()
  }
  return released
}
