import type { Job, Queue } from 'glide-mq'

type JobLookupQueue = Pick<Queue, 'getJob'>

/**
 * Adds `inputs` through `enqueueBulk`, then adds again the ones whose custom job id was held only
 * by a finished record.
 *
 * A custom `jobId` is a hard uniqueness key: GlideMQ skips the entry, returning no job for it,
 * while any record with that id exists. That includes a retained completed or failed record
 * (`removeOnComplete`/`removeOnFail: 100`) and a job that stalled past its limit, which lands in
 * the failed set whatever `removeOnFail` says. A durable dispatcher that re-adds an attempt whose
 * token did not change would then be skipped on every pass.
 *
 * A skipped id is released only when its record is completed or failed, or already gone (including
 * trimmed by retention between the lookup and the state read). A waiting, prioritized, delayed, or
 * active job is the canonical delivery of that attempt, including a retry backing off or a
 * deliberately delayed successor, so it is never touched. The durable source row, not the queue,
 * decides which attempts to dispatch; the caller's recovery page bounds the lookups.
 */
export async function enqueueBulkReactivatingFinished<
  TInput,
  TJob extends Pick<Job, 'id'>,
>(options: {
  queue: JobLookupQueue
  inputs: TInput[]
  jobIdOf: (input: TInput) => string
  enqueueBulk: (inputs: TInput[]) => Promise<TJob[]>
}): Promise<TJob[]> {
  const { queue, inputs, jobIdOf, enqueueBulk } = options
  const added = await enqueueBulk(inputs)
  const addedIds = new Set(added.map(job => job.id))
  const skipped = inputs.filter(input => !addedIds.has(jobIdOf(input)))
  if (skipped.length === 0) return added

  const released = await releaseFinishedJobIds(queue, skipped.map(jobIdOf))
  const reactivated = skipped.filter(input => released.has(jobIdOf(input)))
  if (reactivated.length === 0) return added
  return [...added, ...(await enqueueBulk(reactivated))]
}

async function releaseFinishedJobIds(
  queue: JobLookupQueue,
  jobIds: string[],
): Promise<Set<string>> {
  const released = new Set<string>()
  await Promise.all(
    jobIds.map(async jobId => {
      const job = await queue.getJob(jobId, { excludeData: true })
      if (job) {
        const state = await job.getState()
        if (state === 'completed' || state === 'failed') await job.remove()
        // GlideMQ reports `unknown` when retention trimmed the record between the two reads.
        else if (state !== 'unknown') return
      }
      released.add(jobId)
    }),
  )
  return released
}
