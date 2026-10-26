import { afterEach, describe, expect, it, vi } from 'vitest'
import { getOrCreateQueue } from '@vouchington/worker-runtime/testing'
import { BACKGROUND_QUEUE_NAME } from '../queues/background/config.mts'
import { VOTE_AGGREGATION_UPDATE_ELECTION_JOB } from '../queues/background/enqueues/vote-aggregation-jobs.mts'
import {
  getSharedBackgroundWorker,
  settleSharedBackgroundJobs,
} from '../../test-helpers/shared-background-worker.mts'
import { onceElectionVoteStatsCompleted } from './election-vote-stats.mts'
import { entityRelationMetadatum } from '../types/entities/entity-relations-metadata.mts'
import type {
  EntityRelationElectionTable,
  ElectionJobInput,
} from '../queues/vote-aggregation/enqueues/types-elections.mts'

const queue = getOrCreateQueue(BACKGROUND_QUEUE_NAME)
const addedJobIds = new Set<string>()
const target = (): ElectionJobInput => ({ electionId: crypto.randomUUID(), orderingKey: 'post' })

async function addJob(data: ElectionJobInput, delayed = true) {
  const job = await queue.enqueue(VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name, data, {
    delay: delayed ? 60_000 : 0,
    attempts: 1,
  })
  if (!job) throw new Error('Election fixture was unexpectedly deduplicated')
  addedJobIds.add(job.id)
  return job
}

const deadlineError = (data: ElectionJobInput) =>
  `Elections vote-stats completion for election ${data.electionId} did not settle within 50ms`

describe('onceElectionVoteStatsCompleted', () => {
  afterEach(async () => {
    await settleSharedBackgroundJobs()
    for (const id of addedJobIds) await (await queue.getJob(id))?.remove()
    addedJobIds.clear()
  })

  it('observes a real completion admitted after listener registration and releases its delay', async () => {
    const data = target()
    const completion = onceElectionVoteStatsCompleted(data, 1, 1_000)
    const job = await addJob(data)
    await completion
    expect(await job.getState()).toBe('completed')
  })

  it('promotes an already admitted delayed job', async () => {
    const data = target()
    const job = await addJob(data)
    await onceElectionVoteStatsCompleted(data, 1, 1_000)
    expect(await job.getState()).toBe('completed')
  })

  it('finds a real completion that preceded registration', async () => {
    const data = target()
    const job = await addJob(data, false)
    await settleSharedBackgroundJobs()
    expect(await job.getState()).toBe('completed')
    await onceElectionVoteStatsCompleted(data, 1, 1_000)
  })

  it('reports a real processor failure through live events and the terminal scan', async () => {
    // PostgreSQL rejects this UUID in the real election processor.
    const data: ElectionJobInput = {
      electionId: `invalid-${crypto.randomUUID()}`,
      orderingKey: 'post',
    }
    const live = onceElectionVoteStatsCompleted(data, 1, 1_000)
    const rejected = live.catch((err: unknown) => err)
    const job = await addJob(data)
    expect(await rejected).toMatchObject({
      message: expect.stringContaining(
        `Elections vote-stats job for election ${data.electionId} failed:`,
      ),
    })
    expect(await job.getState()).toBe('failed')
    await expect(onceElectionVoteStatsCompleted(data, 1, 50)).rejects.toThrow(deadlineError(data))
    // A different target ownership key has not consumed this failure; use a second real job.
    const other = { ...data, electionId: `invalid-${crypto.randomUUID()}` }
    const failed = await addJob(other, false)
    await settleSharedBackgroundJobs()
    expect(await failed.getState()).toBe('failed')
    await expect(onceElectionVoteStatsCompleted(other, 1, 1_000)).rejects.toThrow(
      `Elections vote-stats job for election ${other.electionId} failed:`,
    )
  })

  it('counts precompleted and live jobs once each', async () => {
    const data = target()
    await addJob(data, false)
    await settleSharedBackgroundJobs()
    const completion = onceElectionVoteStatsCompleted(data, 2, 1_000)
    const job = await addJob(data)
    await completion
    expect(await job.getState()).toBe('completed')
  })

  it('does not reuse a consumed completion and accepts a new job for the same target', async () => {
    const data = target()
    await addJob(data)
    await onceElectionVoteStatsCompleted(data, 1, 1_000)
    await expect(onceElectionVoteStatsCompleted(data, 1, 50)).rejects.toThrow(deadlineError(data))
    const completion = onceElectionVoteStatsCompleted(data, 1, 1_000)
    await addJob(data)
    await completion
  })

  it('ignores another election and ordering key after their real jobs finish', async () => {
    const data = target()
    const completion = onceElectionVoteStatsCompleted(data, 1, 50)
    const rejected = completion.catch((err: unknown) => err)
    await addJob(target(), false)
    await addJob({ electionId: data.electionId, orderingKey: 'topic' }, false)
    await settleSharedBackgroundJobs()
    expect(await rejected).toMatchObject({ message: deadlineError(data) })
  })

  it('narrows real relation completions by relation table', async () => {
    const tables = entityRelationMetadatum.filter(metadata => metadata.election)
    const first = tables[0]!.table_name as EntityRelationElectionTable
    const second = tables[1]!.table_name as EntityRelationElectionTable
    const data: ElectionJobInput = {
      electionId: crypto.randomUUID(),
      orderingKey: 'entity_relation',
      relationTable: first,
    }
    const completion = onceElectionVoteStatsCompleted(data, 1, 1_000)
    await addJob({ ...data, relationTable: second }, false)
    await settleSharedBackgroundJobs()
    const job = await addJob(data)
    await completion
    expect(await job.getState()).toBe('completed')
  })

  it('rejects a terminal search failure and removes listeners', async () => {
    const worker = getSharedBackgroundWorker()
    const completedListeners = worker.listenerCount('completed')
    const failedListeners = worker.listenerCount('failed')
    const admissionListeners = queue.listenerCount('added')
    const spy = vi.spyOn(queue, 'searchJobs').mockRejectedValueOnce(new Error('search boom'))
    try {
      await expect(onceElectionVoteStatsCompleted(target())).rejects.toThrow('search boom')
    } finally {
      spy.mockRestore()
    }
    expect(worker.listenerCount('completed')).toBe(completedListeners)
    expect(worker.listenerCount('failed')).toBe(failedListeners)
    expect(queue.listenerCount('added')).toBe(admissionListeners)
  })

  it('does not wait when no completions are requested', async () => {
    await expect(onceElectionVoteStatsCompleted(target(), 0)).resolves.toBeUndefined()
  })
})
