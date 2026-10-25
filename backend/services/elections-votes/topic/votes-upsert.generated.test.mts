import { expect, it, beforeAll, describe } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { onceElectionVoteStatsCompleted } from '@voucha/test-helpers/election-vote-stats'
import { holdQueueBulkAdmissions } from '@voucha/test-helpers/queue-admission-hold'
import { removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import {
  VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB,
  VOTE_AGGREGATION_UPDATE_ELECTION_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { getTopicElectionsByIdBatch } from './get-election-batch.mts'
import { getTopicElectionVote } from './votes-get.mts'
import { upsertTopicElectionVotes } from './votes-upsert.mts'
import type { PrivateUser } from '@services/users/types'

describe('votes-upsert.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('full topic vote flow refreshes election view', async () => {
    const topicId = await insertTestTopic({
      name: `Topic Vote Flow ${Math.random().toString(36).slice(2, 10)}`,
      slug: `topic-vote-flow-${Math.random().toString(36).slice(2, 10)}`,
      createdById: user.id,
    })

    await upsertTopicElectionVotes(user.id, [{ entityId: topicId, score: 1 }])

    await onceElectionVoteStatsCompleted({ electionId: topicId, orderingKey: 'topic' })

    const [refreshed] = await getTopicElectionsByIdBatch([topicId])
    expect(refreshed?.votes_count_up).toBe(1)
    expect(refreshed?.votes_count_down).toBe(0)
    expect(refreshed?.votes_score_net).toBe(1)
  })

  it('joins both election and rating admissions after committing the vote', async () => {
    const topicId = await insertTestTopic({
      name: `Topic Vote Admission ${crypto.randomUUID()}`,
      slug: `topic-vote-admission-${crypto.randomUUID()}`,
      createdById: user.id,
    })
    const electionJobName = VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name
    const ratingJobName = VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB.name
    const admissions = holdQueueBulkAdmissions(voteAggregation, [
      {
        jobName: electionJobName,
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
    const election = admissions.holds[0]!
    const rating = admissions.holds[1]!
    let electionEntered = false
    let ratingEntered = false
    void election.entered.then(() => {
      electionEntered = true
    })
    void rating.entered.then(() => {
      ratingEntered = true
    })
    let settled = false
    let operation: ReturnType<typeof upsertTopicElectionVotes> | undefined

    try {
      operation = upsertTopicElectionVotes(user.id, [{ entityId: topicId, score: 1 }]).finally(
        () => {
          settled = true
        },
      )
      await Promise.all([election.entered, rating.entered])
      expect(await getTopicElectionVote(user.id, topicId)).toMatchObject({
        entity_id: topicId,
        user_id: user.id,
        choice: 'like',
      })
      expect(settled).toBe(false)

      election.release()
      rating.release()
      const [votes, electionJobs, ratingJobs] = await Promise.all([
        operation,
        election.admitted,
        rating.admitted,
      ])
      expect(votes).toEqual([expect.objectContaining({ entity_id: topicId, score: 1 })])
      expect(electionJobs).toEqual([
        expect.objectContaining({
          name: electionJobName,
          data: { electionId: topicId, orderingKey: 'topic' },
        }),
      ])
      expect(ratingJobs).toEqual([
        expect.objectContaining({ name: ratingJobName, data: { topicId } }),
      ])
    } finally {
      election.release()
      rating.release()
      try {
        await operation?.catch(() => undefined)
        if (electionEntered)
          await removeEnqueuedJobs([election.admitted.catch(() => [])], electionJobName)
        if (ratingEntered)
          await removeEnqueuedJobs([rating.admitted.catch(() => [])], ratingJobName)
      } finally {
        admissions.restore()
      }
    }
  })

  it('clears a historical topic vote without waiting for topic-ratings drain', async () => {
    const topicId = await insertTestTopic({
      name: `Topic Vote Clear ${Math.random().toString(36).slice(2, 10)}`,
      slug: `topic-vote-clear-${Math.random().toString(36).slice(2, 10)}`,
      createdById: user.id,
    })

    await upsertTopicElectionVotes(user.id, [{ entityId: topicId, score: 1 }])
    await upsertTopicElectionVotes(user.id, [{ entityId: topicId, score: null }])
    await expect(getTopicElectionVote(user.id, topicId)).resolves.toBeNull()
  })
})
