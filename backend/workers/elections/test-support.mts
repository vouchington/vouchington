import { elections as electionsWorker } from './workers.mts'
import { elections as electionsQueue } from '@queues/elections/queues'
import onError from '@modules/on-error'

// Attach an error handler so unhandled 'error' events don't crash the process: this test-support
// context never goes through the worker bootstrap that normally does this (mirrors
// backend/workers/entity-listeners/test-support.mts:10). Guarded so importing this module from many
// test files doesn't accumulate one listener per import.
if (electionsWorker.listenerCount('error') === 0) electionsWorker.on('error', onError)

const JOB_NAME = 'processUpdateElectionVoteStats'

type ElectionJob = {
  id?: string
  name: string
  data: { electionId: string; relationTable?: string }
  failedReason?: string
}

type ElectionQueueSearch = {
  searchJobs(opts: {
    name?: string
    state?: string
    data?: Record<string, unknown>
  }): Promise<ElectionJob[]>
}

function matchesElectionJob(
  job: ElectionJob,
  electionId: string,
  relationTable: string | undefined,
): boolean {
  if (job.name !== JOB_NAME || job.data.electionId !== electionId) return false
  return relationTable === undefined || job.data.relationTable === relationTable
}

type SettledElectionJobs = { completed: ElectionJob[]; failed: ElectionJob[] }

// Pre-scans both terminal states: a job that already failed before this call's listeners
// registered must be surfaced too, or the caller waits out the full timeout instead of rejecting.
async function findSettledElectionJobs(
  electionId: string,
  relationTable: string | undefined,
): Promise<SettledElectionJobs> {
  const search = electionsQueue as unknown as ElectionQueueSearch
  const matches = (job: ElectionJob) => matchesElectionJob(job, electionId, relationTable)
  const [completed, failed] = await Promise.all([
    search.searchJobs({ name: JOB_NAME, state: 'completed', data: { electionId } }),
    search.searchJobs({ name: JOB_NAME, state: 'failed', data: { electionId } }),
  ])
  return { completed: completed.filter(matches), failed: failed.filter(matches) }
}

// Consumed job ids persist across separate calls, not just within one: without this, a second
// wait for the same election (e.g. voting twice against one post) could resolve or reject off a
// job an earlier call already consumed, instead of waiting for the new vote's own recompute.
const consumedJobIds = new Map<string, Set<string>>()

function consumedJobIdsFor(electionId: string, relationTable: string | undefined): Set<string> {
  const key = relationTable === undefined ? electionId : `${electionId}\0${relationTable}`
  let ids = consumedJobIds.get(key)
  if (ids === undefined) {
    ids = new Set()
    consumedJobIds.set(key, ids)
  }
  return ids
}

type WorkerLike = {
  on(event: 'completed', cb: (job: ElectionJob) => void): void
  on(event: 'failed', cb: (job: ElectionJob | undefined, err: Error) => void): void
  off(event: 'completed', cb: (job: ElectionJob) => void): void
  off(event: 'failed', cb: (job: ElectionJob | undefined, err: Error) => void): void
}

/**
 * Wait for a specific elections vote-stats recompute job to complete.
 *
 * Every elections ordering key shares one job name (`processUpdateElectionVoteStats`), so the primary
 * discriminator is `job.data.electionId` — the entity id for most types, and `entity_relation_id` (a
 * UUID unique across every relation table, not just within one) for the `entity_relation` ordering
 * key. The dedup id built by `buildElectionJobOptions` (`backend/queues/elections/enqueues.mts`) also
 * folds `relationTable` in when present, so pass it here too when a test targets a specific
 * `entity_relation` partition and must not false-positive on a UUID shared across tables.
 *
 * `enqueueElectionStats` calls are fire-and-forget (`shared/entity-service.mts`'s
 * `void options.enqueueElectionStats(...)`), and the recompute is scheduled
 * `ELECTIONS_DEFAULTS.recomputeDelayMs` (6s in production) after the triggering vote, deliberately
 * outside normal request latency — see `backend/services/elections-votes/README.md`. Tests that
 * assert on the recomputed aggregate after a vote must call this first.
 *
 * Unlike `onceEntityListenerCompleted` (`backend/workers/entity-listeners/test-support.mts`), this
 * helper does not short-circuit on `worker.isDrained`: elections enqueues are fire-and-forget, so the
 * worker can already be drained *before* the job this call is waiting for has even been added — an
 * `isDrained` early return would resolve immediately and leave the race this helper exists to close.
 * Also unlike that helper, the already-completed/-failed search and the live `completed`/`failed`
 * listeners register together before either is awaited, so a job that settles in the gap between
 * them is still observed instead of being missed by both, whichever terminal state it lands in.
 *
 * Job ids consumed by a match, from the pre-scan or a live event, are tracked in a module-level set
 * keyed by `electionId`/`relationTable`, not just locally within one call: a job a prior call already
 * consumed can't also satisfy or fail a later call for the same election, which matters for tests
 * that vote more than once against the same entity.
 *
 * Rejects if the job fails, so regressions surface as clear errors rather than a 15s timeout.
 *
 * @param count - number of recompute jobs to wait for (default: 1). Only use values > 1 when you
 *   know that many jobs were actually enqueued: throttle dedup (`buildElectionJobOptions`) can
 *   collapse several rapid votes into one job, in which case waiting for N > jobs times out.
 * @param relationTable - for `entity_relation` elections, narrows matching to jobs enqueued for
 *   this table. Omit for every other election type, or when any table sharing the id is acceptable.
 *
 * @example
 * ```ts
 * await request.put(`/api/v1/posts/${postId}/vote`).send({ choice: 'dislike' }).expect(204)
 * await onceElectionVoteStatsCompleted(postId)
 * // the vote-count aggregate has now been recomputed for this post
 * ```
 */
export async function onceElectionVoteStatsCompleted(
  electionId: string,
  count = 1,
  timeoutMs = 15_000,
  relationTable?: string,
): Promise<void> {
  if (count <= 0) return
  const worker = electionsWorker as unknown as WorkerLike
  let remaining = count
  const consumed = consumedJobIdsFor(electionId, relationTable)

  return new Promise<void>((resolve, reject) => {
    let settled = false

    const timer = setTimeout(() => {
      cleanup()
      reject(
        new Error(
          `onceElectionVoteStatsCompleted timed out after ${timeoutMs}ms waiting for election ${electionId}`,
        ),
      )
    }, timeoutMs)

    function cleanup(): void {
      settled = true
      worker.off('completed', onCompleted)
      worker.off('failed', onFailed)
      clearTimeout(timer)
    }

    // False for a job id this or an earlier call already consumed, so callers skip re-acting on it.
    function consumeJobId(jobId: string | undefined): boolean {
      if (jobId === undefined) return true
      if (consumed.has(jobId)) return false
      consumed.add(jobId)
      return true
    }

    function markCompleted(jobId: string | undefined): void {
      if (!consumeJobId(jobId)) return
      remaining--
      if (remaining <= 0 && !settled) {
        cleanup()
        resolve()
      }
    }

    function rejectFailed(jobId: string | undefined, message: string): void {
      if (!consumeJobId(jobId)) return
      cleanup()
      reject(new Error(`Elections vote-stats job for election ${electionId} failed: ${message}`))
    }

    function onCompleted(job: ElectionJob): void {
      if (matchesElectionJob(job, electionId, relationTable)) markCompleted(job.id)
    }

    function onFailed(job: ElectionJob | undefined, err: Error): void {
      if (job === undefined || !matchesElectionJob(job, electionId, relationTable)) return
      rejectFailed(job.id, err.message)
    }

    worker.on('completed', onCompleted)
    worker.on('failed', onFailed)

    findSettledElectionJobs(electionId, relationTable)
      .then(({ completed, failed }) => {
        if (settled) return
        for (const job of failed) {
          rejectFailed(job.id, job.failedReason ?? 'unknown error')
          if (settled) return
        }
        for (const job of completed) markCompleted(job.id)
      })
      .catch((err: unknown) => {
        if (settled) return
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      })
  })
}
