import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
  insertTestTopic,
} from '@voucha/test-helpers'
import { NEUTRAL_REQUIRES_EXISTING_BALLOT } from '@modules/on-error/error-codes'
import { upsertTopicElectionVotes } from '@services/elections-votes/topic'

describe('election-vote-handler retract contract', () => {
  function randomSlug(prefix: string): string {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }

  async function createTopic(): Promise<string> {
    const owner = await createTestUser({ administrator: true })
    return insertTestTopic({
      name: `Vote retract ${randomSlug('topic')}`,
      slug: randomSlug('vote-retract'),
      createdById: owner.id,
    })
  }

  it('rejects Neutral as a first vote', async () => {
    const topicId = await createTopic()
    const firstVoteUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(firstVoteUser)

    const response = await request
      .put(`/api/v1/topics/${topicId}/vote`)
      .send({ choice: 'neutral' })
      .expect(422)
    expect(response.body.code).toBe(NEUTRAL_REQUIRES_EXISTING_BALLOT)
  }, 60_000)

  it('keeps public DELETE Clear available', async () => {
    const topicId = await createTopic()
    const retractUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(retractUser)

    await request.put(`/api/v1/topics/${topicId}/vote`).send({ choice: 'like' }).expect(204)
    await request.delete(`/api/v1/topics/${topicId}/vote`).expect(204)
    const votes = await request.get(`/api/v1/topics/${topicId}/votes`).expect(200)
    expect(votes.body.results).not.toContainEqual(
      expect.objectContaining({ user_id: retractUser.id }),
    )
  }, 60_000)

  it('allows an official account to Clear a historical ballot', async () => {
    const topicId = await createTopic()
    const adminUser = await createTestUser({ administrator: true })
    await upsertTopicElectionVotes(adminUser.id, [{ entityId: topicId, score: 1 }])
    const request = createRequest()
    await request.authenticateAs(adminUser)

    await request.delete(`/api/v1/topics/${topicId}/vote`).expect(204)
    const response = await request.get(`/api/v1/topics/${topicId}/votes`).expect(200)
    expect(response.body.results).not.toContainEqual(
      expect.objectContaining({ user_id: adminUser.id }),
    )
  }, 60_000)
})
