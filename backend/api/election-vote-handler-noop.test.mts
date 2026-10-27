import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
  insertTestTopic,
  insertTopicElectionVote,
  getTopicElectionVoteEventCount,
} from '@voucha/test-helpers'
import {
  getTopicElectionsByIdBatch,
  upsertTopicElectionVotes,
} from '@services/elections-votes/topic'
import { onceElectionVoteStatsCompleted } from '@voucha/test-helpers/election-vote-stats'
import { setAccountTypeTestUserKind } from '@voucha/test-helpers/account-types'
import { holdQueueBulkAdmissions } from '@voucha/test-helpers/queue-admission-hold'
import { removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import {
  VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB,
  VOTE_AGGREGATION_UPDATE_ELECTION_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { topicVoteOptions } from '@services/topics/vote-handler-options'

describe('election vote no-op reconciliation', () => {
  it('joins both no-op repair admissions without appending another vote', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topicId = await createTopicForNoopRetry()
    await insertTopicElectionVote(user.id, topicId, 1, undefined, false, true)
    expect(await getTopicElectionVoteEventCount(user.id, topicId)).toBe(1)
    const statsJobName = VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name
    const ratingJobName = VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB.name
    const admissions = holdQueueBulkAdmissions(voteAggregation, [
      {
        jobName: statsJobName,
        matchesData: data =>
          typeof data === 'object' &&
          data !== null &&
          'electionId' in data &&
          data.electionId === topicId,
      },
      {
        jobName: ratingJobName,
        matchesData: data =>
          typeof data === 'object' &&
          data !== null &&
          'topicId' in data &&
          data.topicId === topicId,
      },
    ])
    const stats = admissions.holds[0]!
    const rating = admissions.holds[1]!
    let statsEntered = false
    let ratingEntered = false
    void stats.entered.then(() => {
      statsEntered = true
    })
    void rating.entered.then(() => {
      ratingEntered = true
    })
    let settled = false
    let operation: Promise<unknown> | undefined

    try {
      operation = Promise.resolve(topicVoteOptions.onNoop!(user, topicId, { id: topicId })).finally(
        () => {
          settled = true
        },
      )
      await Promise.all([stats.entered, rating.entered])
      expect(await getTopicElectionVoteEventCount(user.id, topicId)).toBe(1)
      expect(settled).toBe(false)
      stats.release()
      rating.release()
      const [, statsJobs, ratingJobs] = await Promise.all([
        operation,
        stats.admitted,
        rating.admitted,
      ])
      expect(statsJobs).toEqual([
        expect.objectContaining({
          name: statsJobName,
          data: { electionId: topicId, orderingKey: 'topic' },
        }),
      ])
      expect(ratingJobs).toEqual([
        expect.objectContaining({ name: ratingJobName, data: { topicId } }),
      ])
    } finally {
      stats.release()
      rating.release()
      try {
        await operation?.catch(() => undefined)
        if (statsEntered) await removeEnqueuedJobs([stats.admitted.catch(() => [])], statsJobName)
        if (ratingEntered)
          await removeEnqueuedJobs([rating.admitted.catch(() => [])], ratingJobName)
      } finally {
        admissions.restore()
      }
    }
  })

  it('records a semantic like after a legacy vouch and refreshes aggregate stats', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topicId = await createTopicForNoopRetry()
    await insertTopicElectionVote(user.id, topicId, 1)

    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'like' }).expect(204)
    await onceElectionVoteStatsCompleted({ electionId: topicId, orderingKey: 'topic' })

    await expect(getTopicElectionVoteEventCount(user.id, topicId)).resolves.toBe(2)

    await expect(getTopicElectionsByIdBatch([topicId])).resolves.toEqual([
      expect.objectContaining({ votes_count_up: 1, votes_count_down: 0, votes_score_net: 1 }),
    ])
  })

  it('reconciles missing stats after a same-choice retry without appending an event', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topicId = await createTopicForNoopRetry()
    await insertTopicElectionVote(user.id, topicId, 1, undefined, false, true)

    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'like' }).expect(204)
    await onceElectionVoteStatsCompleted({ electionId: topicId, orderingKey: 'topic' })

    await expect(getTopicElectionVoteEventCount(user.id, topicId)).resolves.toBe(1)

    await expect(getTopicElectionsByIdBatch([topicId])).resolves.toEqual([
      expect.objectContaining({ votes_count_up: 1, votes_count_down: 0, votes_score_net: 1 }),
    ])
  })

  it('reconciles aggregate stats when an official Clear retry follows a missed enqueue', async () => {
    // The writer rejects a platform account's vote, so the +1 predates the promotion.
    const user = await createTestUser()
    const topicId = await createTopicForNoopRetry()
    await upsertTopicElectionVotes(user.id, [{ entityId: topicId, score: 1 }])
    await onceElectionVoteStatsCompleted({ electionId: topicId, orderingKey: 'topic' })
    await setAccountTypeTestUserKind(user.id, 'official')
    await insertTopicElectionVote(user.id, topicId, null)

    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/topics/${topicId}/vote`).expect(204)
    await onceElectionVoteStatsCompleted({ electionId: topicId, orderingKey: 'topic' })

    await expect(getTopicElectionsByIdBatch([topicId])).resolves.toEqual([
      expect.objectContaining({ votes_count_up: 0, votes_count_down: 0, votes_score_net: 0 }),
    ])
  })

  it('does not append a Clear event for an official retry of a legacy zero ballot', async () => {
    const user = await createTestUser({ administrator: true })
    const topicId = await createTopicForNoopRetry()
    await insertTopicElectionVote(user.id, topicId, 0)

    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/topics/${topicId}/vote`).expect(204)

    await expect(getTopicElectionVoteEventCount(user.id, topicId)).resolves.toBe(1)
  })

  it.each([
    { choice: 'vouch', score: 2 },
    { choice: 'disavow', score: -2 },
  ] as const)(
    'does not append a semantic event for a migrated $choice ballot',
    async ({ choice, score }) => {
      const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const topicId = await createTopicForNoopRetry()
      await insertTopicElectionVote(user.id, topicId, score)

      const request = createRequest()
      await request.authenticateAs(user)
      await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice }).expect(204)

      await expect(getTopicElectionVoteEventCount(user.id, topicId)).resolves.toBe(1)
    },
  )
})

async function createTopicForNoopRetry(): Promise<string> {
  const owner = await createTestUser()
  const suffix = crypto.randomUUID().slice(0, 8)
  return insertTestTopic({
    name: `No-op retry ${suffix}`,
    slug: `no-op-retry-${suffix}`,
    createdById: owner.id,
  })
}
