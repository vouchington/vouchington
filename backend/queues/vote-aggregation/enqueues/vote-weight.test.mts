import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB,
  VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '../queues.mts'
import {
  enqueueRecalculateVoteWeightDispatcher,
  enqueueRecalculateUserVoteWeight,
  enqueueRecalculateVoteWeightEvents,
  enqueueUserElectionFanOut,
} from './vote-weight.mts'

describe('vote weight enqueues', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function interceptAdd() {
    return vi.spyOn(voteAggregation, 'add').mockResolvedValueOnce({ id: 'admitted' } as never)
  }

  it('throttles the vote weight dispatcher under a caller-named deduplication id', async () => {
    const add = interceptAdd()

    await enqueueRecalculateVoteWeightDispatcher(null, { deduplicationId: 'weights-backfill' })

    expect(add).toHaveBeenCalledExactlyOnceWith(
      VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB.name,
      { afterId: null },
      expect.objectContaining({
        deduplication: { id: 'weights-backfill', mode: 'throttle', ttl: 3_600_000 },
      }),
    )
  })

  it('leaves the vote weight dispatcher to the job defaults without a deduplication id', async () => {
    const add = interceptAdd()

    await enqueueRecalculateVoteWeightDispatcher()

    expect(add).toHaveBeenCalledExactlyOnceWith(
      VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB.name,
      { afterId: undefined },
      expect.objectContaining({ priority: expect.any(Number) }),
    )
    expect(add.mock.calls[0]![2]).not.toHaveProperty('deduplication')
  })

  it('keys direct recalculation to the user and enqueue epoch', async () => {
    const add = interceptAdd()
    const userId = randomUUID()
    vi.spyOn(Date, 'now').mockReturnValue(1_000)

    await enqueueRecalculateUserVoteWeight(userId)

    expect(add).toHaveBeenCalledExactlyOnceWith(
      'vote-aggregation.processRecalculateUserVoteWeight',
      { userId },
      expect.objectContaining({ jobId: `voteWeight__${userId}__direct__1000` }),
    )
    expect(add.mock.calls[0]![2]).not.toHaveProperty('deduplication')
  })

  it('starts a user election fan-out without a job id so a later pass is not coalesced', async () => {
    const add = interceptAdd()
    const userId = randomUUID()

    await enqueueUserElectionFanOut(userId)

    expect(add).toHaveBeenCalledExactlyOnceWith(
      VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB.name,
      { userId, cursor: null },
      expect.anything(),
    )
    expect(add.mock.calls[0]![2]).not.toHaveProperty('jobId')
  })

  it('names a user election fan-out continuation by its cursor', async () => {
    const add = interceptAdd()
    const userId = randomUUID()
    const cursor = { lane: 2, afterId: randomUUID() }

    await enqueueUserElectionFanOut(userId, cursor)

    expect(add).toHaveBeenCalledExactlyOnceWith(
      VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB.name,
      { userId, cursor },
      expect.objectContaining({
        jobId: `userElectionFanOut__${userId}__2__${cursor.afterId}`,
      }),
    )
  })
})

describe('vote-weight event enqueue', () => {
  it('reactivates a retained completed event when an overlap reads it again', async () => {
    const userId = randomUUID()
    const jobId = `voteWeight__${userId}__membershipExpired__${randomUUID()}`
    await enqueueRecalculateVoteWeightEvents([{ userId, jobId }])
    await expect((await voteAggregation.getJob(jobId))?.getState()).resolves.toBe('completed')
    const replay = await enqueueRecalculateVoteWeightEvents([{ userId, jobId }])
    expect(replay.map(job => job.id)).toEqual([jobId])
    await expect((await voteAggregation.getJob(jobId))?.getState()).resolves.toBe('completed')
  })

  it('reactivates the stable force id for a later administrator recalculation', async () => {
    const userId = randomUUID()
    const jobId = `voteWeight__${userId}__force`
    await enqueueRecalculateUserVoteWeight(userId, true)
    await expect((await voteAggregation.getJob(jobId))?.getState()).resolves.toBe('completed')
    const replay = await enqueueRecalculateUserVoteWeight(userId, true)
    expect(replay).toHaveLength(1)
    await expect(voteAggregation.getJob(jobId)).resolves.toMatchObject({
      id: jobId,
      data: { userId, forceRecalculate: true },
    })
  })
})
