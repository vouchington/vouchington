import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUserWithAge,
  insertTestTopic,
  suspendTestUser,
  unsuspendTestUser,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { getTopicElectionVote } from '@services/elections-votes/topic/votes-get'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'

describe('election vote handlers reject suspended users', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('blocks vote creation and clearing before either can mutate vote state', async () => {
    const voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topic = await insertTestTopic({
      name: `Suspension vote ${crypto.randomUUID()}`,
      slug: `suspension-vote-${crypto.randomUUID()}`,
      createdById: voter.id,
    })
    const request = createRequest()
    await request.authenticateAs(voter)
    await request.put(`/api/v1/topics/${topic}/vote`).send({ choice: 'like' }).expect(204)
    const existing = await getTopicElectionVote(voter.id, topic)
    expect(existing?.choice).toBe('like')

    suspendedUserIds.push(voter.id)
    await suspendTestUser(voter.id)

    for (const response of [
      await request.put(`/api/v1/topics/${topic}/vote`).send({ choice: 'dislike' }),
      await request.delete(`/api/v1/topics/${topic}/vote`),
    ]) {
      expect(response.status).toBe(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    }
    expect(await getTopicElectionVote(voter.id, topic)).toEqual(existing)
  })
})
