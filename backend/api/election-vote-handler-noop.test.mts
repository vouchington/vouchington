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
import { getTopicElectionById, upsertTopicElectionVotes } from '@services/elections-votes/topic'
import { onceElectionVoteStatsCompleted } from '@workers/elections/test-support'

describe('election vote no-op reconciliation', () => {
  it('reconciles aggregate stats when a same-choice retry follows a missed enqueue', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topicId = await createTopicForNoopRetry()
    await insertTopicElectionVote(user.id, topicId, 1)

    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'like' }).expect(204)
    await onceElectionVoteStatsCompleted(topicId)

    await expect(getTopicElectionById(topicId)).resolves.toEqual(
      expect.objectContaining({ votes_count_up: 1, votes_count_down: 0, votes_score_net: 1 }),
    )
  }, 30_000)

  it('reconciles aggregate stats when an official Clear retry follows a missed enqueue', async () => {
    const user = await createTestUser({ administrator: true })
    const topicId = await createTopicForNoopRetry()
    await upsertTopicElectionVotes(user.id, [{ entityId: topicId, score: 1 }])
    await onceElectionVoteStatsCompleted(topicId)
    await insertTopicElectionVote(user.id, topicId, null)

    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/topics/${topicId}/vote`).expect(204)
    await onceElectionVoteStatsCompleted(topicId)

    await expect(getTopicElectionById(topicId)).resolves.toEqual(
      expect.objectContaining({ votes_count_up: 0, votes_count_down: 0, votes_score_net: 0 }),
    )
  }, 30_000)

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
