import { it, expect, describe, beforeAll } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { getTopicElectionById } from './get-election.mts'
import type { PrivateUser } from '@services/users/types'

describe('get-election', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('getTopicElectionById', () => {
    it('retrieves topic election by UUID', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topicId = await insertTestTopic({
        name: `Topic Election ${random}`,
        slug: `topic-election-${random}`,
        createdById: user.id,
      })

      const election = await getTopicElectionById(topicId)

      expect(election).toMatchObject({
        __entity_type: 'topic_election',
        id: topicId,
        votes_score_net: expect.any(Number),
        votes_count_up: expect.any(Number),
        votes_count_down: expect.any(Number),
      })
    })

    it('returns null for non-existent UUID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'
      const election = await getTopicElectionById(nonExistentId)
      expect(election).toBeNull()
    })
  })
})
