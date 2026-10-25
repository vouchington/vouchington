import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { VOTE_AGGREGATION_UPDATE_ELECTION_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { enqueueBulkUpdateTopicElectionVoteStats } from '@queues/vote-aggregation/enqueues/elections'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { describe, expect, it, vi } from 'vitest'
import {
  commitTestElectionVoteTransaction,
  rollbackTestElectionVoteTransaction,
} from '../../../test-helpers/data-stores/psql/election-vote-transactions.mts'
import { TOPIC_ELECTION_CONFIG } from '../topic/config.mts'
import { getTopicElectionVote } from '../topic/votes-get.mts'
import { createVotesUpsert } from './entity-service.mts'
import type { ElectionVoteMutationResult } from './types.mts'

describe('createVotesUpsert', () => {
  it('publishes transaction-scoped vote side effects only after commit', async () => {
    const user = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Deferred Vote Side Effects ${Math.random().toString(36).slice(2, 10)}`,
      slug: `deferred-vote-side-effects-${Math.random().toString(36).slice(2, 10)}`,
      createdById: user.id,
    })
    const enqueueElectionStats = vi.fn<(entityIds: string[]) => Promise<void>>(async () => {})
    const afterUpsert = vi.fn<
      (entityIds: string[], upsertedVotes: ElectionVoteMutationResult[]) => Promise<void>
    >(async () => {})
    const upsertVotes = createVotesUpsert(TOPIC_ELECTION_CONFIG, {
      enqueueElectionStats,
      afterUpsert,
    })

    await commitTestElectionVoteTransaction(upsertVotes, user.id, topicId, () => {
      expect(enqueueElectionStats).not.toHaveBeenCalled()
      expect(afterUpsert).not.toHaveBeenCalled()
    })
    expect(enqueueElectionStats).toHaveBeenCalledExactlyOnceWith([topicId])
    expect(afterUpsert).toHaveBeenCalledExactlyOnceWith(
      [topicId],
      expect.arrayContaining([expect.objectContaining({ entity_id: topicId })]),
    )
  })

  it('discards transaction-scoped vote side effects on rollback', async () => {
    const user = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Rolled Back Vote Side Effects ${Math.random().toString(36).slice(2, 10)}`,
      slug: `rolled-back-vote-side-effects-${Math.random().toString(36).slice(2, 10)}`,
      createdById: user.id,
    })
    const enqueueElectionStats = vi.fn<(entityIds: string[]) => Promise<void>>(async () => {})
    const afterUpsert = vi.fn<
      (entityIds: string[], upsertedVotes: ElectionVoteMutationResult[]) => Promise<void>
    >(async () => {})
    const upsertVotes = createVotesUpsert(TOPIC_ELECTION_CONFIG, {
      enqueueElectionStats,
      afterUpsert,
    })

    await rollbackTestElectionVoteTransaction(upsertVotes, user.id, topicId)

    expect(enqueueElectionStats).not.toHaveBeenCalled()
    expect(afterUpsert).not.toHaveBeenCalled()
    await expect(getTopicElectionVote(user.id, topicId)).resolves.toBeNull()
  })

  it('keeps a committed vote when its reported stats admission fails', async () => {
    const user = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Failed Vote Stats Admission ${crypto.randomUUID()}`,
      slug: `failed-vote-stats-admission-${crypto.randomUUID()}`,
      createdById: user.id,
    })
    const admissionError = new Error('Injected election stats admission failure')
    const originalAddBulk = voteAggregation.addBulk
    const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
    let matchingAdmissions = 0
    const addBulkSpy = vi.spyOn(voteAggregation, 'addBulk').mockImplementation(jobs => {
      if (
        jobs.some(
          job =>
            job.name === VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name &&
            typeof job.data === 'object' &&
            job.data !== null &&
            'electionId' in job.data &&
            job.data.electionId === topicId,
        )
      ) {
        matchingAdmissions += 1
        return Promise.reject(admissionError)
      }
      return originalAddBulk.call(voteAggregation, jobs)
    })

    try {
      const upsertVotes = createVotesUpsert(TOPIC_ELECTION_CONFIG, {
        enqueueElectionStats: enqueueBulkUpdateTopicElectionVoteStats,
      })
      const votes = await upsertVotes(user.id, [{ entityId: topicId, score: 1 }])
      expect(votes).toEqual([expect.objectContaining({ entity_id: topicId, score: 1 })])
      await expect(getTopicElectionVote(user.id, topicId)).resolves.toMatchObject({
        entity_id: topicId,
        user_id: user.id,
        choice: 'like',
      })
      expect(matchingAdmissions).toBe(1)
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportsBefore)
          .filter(([reportedError]) => reportedError === admissionError),
      ).toHaveLength(1)
    } finally {
      addBulkSpy.mockRestore()
    }
  })
})
