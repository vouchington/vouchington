/**
 * Read back an enqueued job by id instead of scanning a queue's `waiting` list.
 *
 * `EnqueueReturnType` (`@backend/types/enqueue`) is `Promise<unknown> | void`, so `await enqueueX()`
 * is `unknown`: it is a persisted job when the add was accepted, or `null` when deduplication
 * skipped it (production `glide-mq` returns `null` for a deduplicated/skipped add, not shim-only
 * behavior). These helpers narrow that value for tests; they intentionally do not widen the
 * production enqueue typing.
 *
 * State-independent by design: a queue's `waiting` list empties the moment any worker attaches and
 * drains a job in the same fork (`isolate: false` shares queue state across every file). Reading the
 * job back by id works whether it is waiting, active, or already completed.
 *
 * `readAllQueueJobs` below covers the other shape: an INDIRECT assertion with no job handle to read
 * back by id (the job is a side effect of a service/HTTP call), or a bulk enqueue whose return value
 * has no single `.id`. It scans every state instead of `'waiting'` alone, so it sees jobs a worker has
 * already drained to `active`/`completed`/`failed`/`delayed` in the same fork. Its result includes
 * every job the fork has ever put on that queue — the shim never prunes terminal records, and
 * `glide-mq-vitest-obliterate.mts` (`queue.jobs.clear()`) only runs when a file explicitly calls it —
 * so every absence assertion built on it must scope itself with a predicate (e.g. `.filter()` on
 * `job.data.<id>` or `job.name`); an unscoped `toHaveLength(0)` will eventually pick up another
 * file's terminal jobs on a shared queue.
 */

type EnqueuedJobLike = { id: string }

/** The five job states reachable through `getJobs`/`searchJobs`. `'suspended'` is a real record
 * state but is not part of that public union, so it is deliberately excluded here. */
export const QUEUE_JOB_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const

export type QueueJobState = (typeof QUEUE_JOB_STATES)[number]

export type AllStateQueueJobReader<T> = {
  getJobs: (state: QueueJobState) => Promise<T[]>
}

export type QueueJobReader<T> = {
  getJob: (id: string) => Promise<T | null | undefined>
}

/** True when an enqueue call returned `null` — the add was deduplicated/skipped, not persisted. */
export function isDeduplicatedEnqueue(enqueued: unknown): enqueued is null {
  return enqueued === null
}

/** Extracts the job id from an `await enqueueX()` result, throwing a descriptive error otherwise. */
export function getEnqueuedJobId(enqueued: unknown): string {
  if (isDeduplicatedEnqueue(enqueued)) {
    throw new Error(
      'Enqueue call was deduplicated (returned null); there is no persisted job to read back. ' +
        'Use isDeduplicatedEnqueue() to assert the dedup case instead.',
    )
  }
  if (
    typeof enqueued !== 'object' ||
    enqueued === null ||
    typeof (enqueued as Partial<EnqueuedJobLike>).id !== 'string'
  ) {
    throw new Error(`Expected an enqueued job with a string "id", got: ${JSON.stringify(enqueued)}`)
  }
  return (enqueued as EnqueuedJobLike).id
}

/**
 * Resolves the persisted job for an `await enqueueX()` result, independent of the job's current
 * queue state. Throws if the enqueue was deduplicated or the job record is missing.
 */
export async function readEnqueuedJob<T>(queue: QueueJobReader<T>, enqueued: unknown): Promise<T> {
  const id = getEnqueuedJobId(enqueued)
  const job = await queue.getJob(id)
  if (job == null) {
    throw new Error(`No persisted job found for id "${id}"; it may already have been removed`)
  }
  return job
}

/**
 * Reads every job on a queue across all five states, for assertions with no enqueue return value to
 * read back by id (an INDIRECT side-effect job, or a bulk enqueue whose result has no single `.id`).
 * Sorted by `timestamp` (tiebroken by `id`) so callers can rely on enqueue order regardless of how
 * far a worker has drained the queue — without the sort, every `waiting` job would sort before every
 * `active`/`completed` one, and that ordering shifts with drain progress rather than enqueue time.
 *
 * Every ABSENCE assertion built on this must be predicate-scoped (see the file header) — this
 * returns the queue's whole history in the fork, not just what the current test added.
 */
export async function readAllQueueJobs<T extends { id: string; timestamp: number }>(
  queue: AllStateQueueJobReader<T>,
): Promise<T[]> {
  const jobsByState = await Promise.all(QUEUE_JOB_STATES.map(state => queue.getJobs(state)))
  return jobsByState
    .flat()
    .sort((a, b) => a.timestamp - b.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
