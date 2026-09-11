import { expect, it, beforeAll, describe } from 'vitest'
import { createTestUser, insertTestTopic, pollUntilNotNull } from '@voucha/test-helpers'
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

    const refreshed = await waitForUpdatedElectionStats(topicId)
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

  async function waitForUpdatedElectionStats(topicId: string) {
    const latest = await pollUntilNotNull(
      async () => {
        const latest = await getTopicElectionById(topicId)
        if (latest && latest.votes_count_up === 1 && latest.votes_count_down === 0) {
          return latest
        }
        return null
      },
      2500,
      50,
    )

    if (latest === null)
      throw new Error(`Topic election stats did not converge in time: ${topicId}`)
    return latest
  }
})
