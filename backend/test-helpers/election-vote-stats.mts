import { getSharedBackgroundWorker } from '../../test-helpers/shared-background-worker.mts'
import type { ElectionJobInput } from '../queues/vote-aggregation/enqueues/types-elections.mts'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'
import onError from '../modules/on-error/index.mts'
import {
  type ElectionJob,
  findSettledElectionJobs,
  matchesElectionJob,
  startPromotingElectionJobs,
} from './election-vote-stats-jobs.mts'

// Attach an error handler so unhandled 'error' events don't crash the process: this test-support
// context never goes through the worker bootstrap that normally does this (mirrors
// backend/test-helpers/workers/entity-listeners/test-support.mts:10). Guarded so importing this module from many
// test files doesn't accumulate one listener per import.
const electionsWorker = getSharedBackgroundWorker()
if (electionsWorker.listenerCount('error') === 0) electionsWorker.on('error', onError)

// Below the owning backend test budget, so a stalled wait reports its target first.
const ELECTION_COMPLETION_DEADLINE_MS = 4_000

// Consumed job ids persist across separate calls, not just within one: without this, a second
// wait for the same election (e.g. voting twice against one post) could resolve or reject off a
// job an earlier call already consumed, instead of waiting for the new vote's own recompute.
const consumedJobIds = new Map<string, Set<string>>()

function consumedJobIdsFor(target: ElectionJobInput): Set<string> {
  const key = `${target.orderingKey}\0${target.relationTable ?? ''}\0${target.electionId}`
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
 * Observe owned terminal jobs, including jobs settled before registration. Consumed IDs cannot
 * satisfy a later wait. Queue admission promotes debounced jobs without waiting for wall time.
 * Count must reflect admitted jobs: deduplication can collapse several votes into one job.
 */
export async function onceElectionVoteStatsCompleted(
  target: ElectionJobInput,
  count = 1,
  timeoutMs = ELECTION_COMPLETION_DEADLINE_MS,
): Promise<void> {
  if (count <= 0) return
  const worker = electionsWorker as unknown as WorkerLike
  let remaining = count
  const consumed = consumedJobIdsFor(target)

  let cleanup = () => {}
  const pending = new Promise<void>((resolve, reject) => {
    let settled = false
    let stopPromoting = () => {}
    cleanup = () => {
      settled = true
      worker.off('completed', onCompleted)
      worker.off('failed', onFailed)
      stopPromoting()
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
      reject(
        new Error(`Elections vote-stats job for election ${target.electionId} failed: ${message}`),
      )
    }

    function onCompleted(job: ElectionJob): void {
      if (matchesElectionJob(job, target)) markCompleted(job.id)
    }

    function onFailed(job: ElectionJob | undefined, err: Error): void {
      if (job === undefined || !matchesElectionJob(job, target)) return
      rejectFailed(job.id, err.message)
    }

    worker.on('completed', onCompleted)
    worker.on('failed', onFailed)
    stopPromoting = startPromotingElectionJobs(target, reject)

    findSettledElectionJobs(target)
      .then(({ completed, failed }) => {
        if (settled) return
        for (const job of failed) {
          rejectFailed(job.id, job.failedReason ?? 'unknown error')
          if (settled) return
        }
        for (const job of completed) {
          markCompleted(job.id)
          if (settled) return
        }
      })
      .catch((err: unknown) => {
        if (settled) return
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      })
  })
  try {
    await waitForRealGlideEvent(
      pending,
      `Elections vote-stats completion for election ${target.electionId}`,
      timeoutMs,
    )
  } finally {
    cleanup()
  }
}
