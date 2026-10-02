import { expect, it, beforeAll, describe } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { onceElectionVoteStatsCompleted } from '@voucha/test-helpers/election-vote-stats'
import { getTopicElectionById } from './get-election.mts'
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

    const refreshed = await getTopicElectionById(topicId)
    expect(refreshed?.votes_count_up).toBe(1)
    expect(refreshed?.votes_count_down).toBe(0)
    expect(refreshed?.votes_score_net).toBe(1)
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
