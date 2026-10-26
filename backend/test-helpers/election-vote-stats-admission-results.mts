import type { Job } from 'glide-mq'
import { VOTE_AGGREGATION_UPDATE_ELECTION_JOB } from '../queues/background/enqueues/vote-aggregation-jobs.mts'
import type { createElectionInstrumentation } from './election-vote-stats-instrumentation.mts'
import type { ElectionTerminal } from './election-vote-stats-events.mts'

/** Original logical creation/vote assertions use real call-through inputs and compact returned IDs. */
export async function completeOwnedElectionAdmissions(
  ready: {
    targets: { lowScoreId: string; highScoreId: string }
    actions: Array<() => Promise<unknown>>
  },
  instrumentation: ReturnType<typeof createElectionInstrumentation>,
  wait: (kind: 'entity' | 'election', id: string) => Promise<ElectionTerminal>,
  assertOpen: () => void,
) {
  const targets = new Map<string, 'low' | 'high'>()
  targets.set(ready.targets.lowScoreId, 'low')
  targets.set(ready.targets.highScoreId, 'high')
  for (const id of targets.keys()) {
    const attempts = instrumentation.entityJobs.filter(item => item.entityId === id)
    if (!attempts.length) throw new Error(`No creator enqueue observed for ${id}`)
    const jobs = await settleAll(attempts.map(item => item.job))
    if (jobs.some(job => !job)) throw new Error(`Missing actual creator job for ${id}`)
    const actualJobs = jobs.filter((job): job is NonNullable<typeof job> => job !== null)
    for (const job of new Map(actualJobs.map(job => [job.id, job])).values()) {
      const result = await wait('entity', job.id)
      if (result.failed)
        throw new Error(`Creator job ${job.id} failed`, {
          cause: Object.hasOwn(result, 'failureCause') ? result.failureCause : result.failedReason,
        })
    }
  }
  const creation = instrumentation.admissions.filter(
    item => item.phase === 'creation' && item.ids.some(id => targets.has(id)),
  )
  const createdCounts = new Map<string, number>()
  for (const item of creation)
    for (const id of item.ids.filter(id => targets.has(id)))
      createdCounts.set(id, (createdCounts.get(id) ?? 0) + 1)
  if (creation.length !== 2 || [...targets.keys()].some(id => createdCounts.get(id) !== 1))
    throw new Error(
      `Expected two creator stats enqueues; observed ${JSON.stringify([...createdCounts])}`,
    )
  await settleAll(creation.map(item => item.jobs))
  instrumentation.votes()
  for (const action of ready.actions) {
    assertOpen()
    await action()
  }
  const votes = instrumentation.admissions.filter(
    item => item.phase === 'votes' && item.ids.some(id => targets.has(id)),
  )
  const voteCounts = new Map<string, number>()
  for (const item of votes)
    for (const id of item.ids.filter(id => targets.has(id)))
      voteCounts.set(id, (voteCounts.get(id) ?? 0) + 1)
  const low = ready.targets.lowScoreId
  const high = ready.targets.highScoreId
  if (votes.length !== 3 || voteCounts.get(low) !== 1 || voteCounts.get(high) !== 2)
    throw new Error(
      `Expected logical vote enqueues low=1/high=2; observed ${JSON.stringify([...voteCounts])}`,
    )
  await settleAll(votes.map(item => item.jobs))

  const owned = new Map<'low' | 'high', Map<string, Job<{ electionId: string }>>>([
    ['low', new Map()],
    ['high', new Map()],
  ])
  for (const item of [...creation, ...votes]) {
    const jobs = await item.jobs
    for (const job of Array.isArray(jobs) ? (jobs as Job<{ electionId: string }>[]) : []) {
      if (job.name !== VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name) continue
      const id = job.data.electionId
      const target = targets.get(id)
      if (target) owned.get(target)!.set(job.id, job)
    }
    for (const id of item.ids) {
      const target = targets.get(id)
      if (target && !owned.get(target)!.size)
        throw new Error(`Unowned deduplicated ${target} stats enqueue`)
    }
  }
  const ownedJobs = [...owned.values()].flatMap(group => [...group.values()])
  // All creation and vote admissions have settled. These exact returned jobs are the only ones
  // promoted; no test producer enqueues again after this point, so throttle state is irrelevant.
  await settleAll(
    ownedJobs.map(async job => {
      if ((await job.getState()) !== 'delayed') return
      try {
        await job.promote()
      } catch (err) {
        // The worker or delay timer can take the job between the state read and promotion.
        if ((await job.getState()) === 'delayed') throw err
      }
    }),
  )
  const completedJobs = await settleAll(
    ownedJobs.map(async job => {
      const result = await wait('election', job.id)
      if (result.failed)
        throw new Error(`Stats job ${job.id} failed`, {
          cause: Object.hasOwn(result, 'failureCause') ? result.failureCause : result.failedReason,
        })
      return { jobId: job.id, target: targets.get(job.data.electionId)! }
    }),
  )
  return {
    targets: ready.targets,
    logicalAdmissions: { creation: creation.length, votes: votes.length },
    ownedJobIds: ownedJobs.map(job => job.id),
    completedJobs,
  }
}
async function settleAll<T>(promises: Promise<T>[]) {
  const results = await Promise.allSettled(promises)
  const errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
  if (errors.length)
    throw new AggregateError(errors, 'Owned admissions failed', { cause: errors[0] })
  return results.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []))
}
