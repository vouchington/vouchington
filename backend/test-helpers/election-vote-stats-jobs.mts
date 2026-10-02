import { elections as electionsQueue } from '../queues/elections/queues.mts'
import type { ElectionsJobData } from '../queues/elections/types.mts'
import { promoteDelayedJobs } from './queue-jobs.mts'

export const JOB_NAME = 'processUpdateElectionVoteStats'
const PROMOTE_INTERVAL_MS = 25

export type ElectionJob = {
  id?: string
  name: string
  data: ElectionsJobData['data']
  failedReason?: string
}

type ElectionQueueSearch = {
  searchJobs(opts: {
    name?: string
    state?: string
    data?: Record<string, unknown>
  }): Promise<ElectionJob[]>
}

export function matchesElectionJob(job: ElectionJob, target: ElectionsJobData['data']): boolean {
  return (
    job.name === JOB_NAME &&
    job.data.electionId === target.electionId &&
    job.data.orderingKey === target.orderingKey &&
    job.data.relationTable === target.relationTable
  )
}

type SettledElectionJobs = { completed: ElectionJob[]; failed: ElectionJob[] }

// Pre-scans both terminal states: a job that already failed before this call's listeners
// registered must be surfaced too, or the caller waits out the full timeout instead of rejecting.
export async function findSettledElectionJobs(
  target: ElectionsJobData['data'],
): Promise<SettledElectionJobs> {
  const search = electionsQueue as unknown as ElectionQueueSearch
  const matches = (job: ElectionJob) => matchesElectionJob(job, target)
  const [completed, failed] = await Promise.all([
    search.searchJobs({
      name: JOB_NAME,
      state: 'completed',
      data: { electionId: target.electionId },
    }),
    search.searchJobs({ name: JOB_NAME, state: 'failed', data: { electionId: target.electionId } }),
  ])
  return { completed: completed.filter(matches), failed: failed.filter(matches) }
}

/**
 * Releases this election's recompute as soon as it exists, and returns the function that stops
 * that. The recompute is debounced by `ELECTIONS_DEFAULTS.recomputeDelayMs`, which `glide-mq`
 * 0.16's test queue honors with a real timer, and the enqueue is fire-and-forget so the job may
 * not exist yet when a test starts waiting: the interval re-checks until the caller stops it.
 */
export function startPromotingElectionJobs(target: ElectionsJobData['data']): () => void {
  const timer = setInterval(() => {
    promoteDelayedJobs(electionsQueue, {
      name: JOB_NAME,
      data: { electionId: target.electionId },
    }).catch(() => undefined)
  }, PROMOTE_INTERVAL_MS)
  return () => clearInterval(timer)
}
