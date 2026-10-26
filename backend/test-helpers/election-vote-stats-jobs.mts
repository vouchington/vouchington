import { getOrCreateQueue } from '@vouchington/worker-runtime/testing'
import { voteAggregation as electionsQueue } from '../queues/vote-aggregation/queues.mts'
import type { ElectionJobInput } from '../queues/vote-aggregation/enqueues/types-elections.mts'
import { VOTE_AGGREGATION_UPDATE_ELECTION_JOB } from '../queues/background/enqueues/vote-aggregation-jobs.mts'
import { promoteDelayedJobs } from './queue-jobs.mts'

export const JOB_NAME = VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name

export type ElectionJob = {
  id?: string
  name: string
  data: ElectionJobInput
  failedReason?: string
}

type ElectionQueueSearch = {
  searchJobs(opts: {
    name?: string
    state?: string
    data?: Record<string, unknown>
  }): Promise<ElectionJob[]>
}

export function matchesElectionJob(job: ElectionJob, target: ElectionJobInput): boolean {
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
  target: ElectionJobInput,
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

/** Promote existing and newly admitted owned jobs in response to queue admission. */
export function startPromotingElectionJobs(
  target: ElectionJobInput,
  onError: (error: unknown) => void,
): () => void {
  const queue = getOrCreateQueue(electionsQueue.name)
  const promote = () => {
    void promoteDelayedJobs(electionsQueue, {
      name: JOB_NAME,
      data: {
        electionId: target.electionId,
        orderingKey: target.orderingKey,
        ...(target.relationTable ? { relationTable: target.relationTable } : {}),
      },
    }).catch(onError)
  }
  const onAdded = (job: ElectionJob) => {
    if (matchesElectionJob(job, target)) promote()
  }
  // Subscribe before the scan, so admission during that scan cannot be missed.
  queue.on('added', onAdded)
  promote()
  return () => {
    queue.off('added', onAdded)
  }
}
