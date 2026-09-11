import { it, expect, describe, beforeAll } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { getPostElectionById } from './get-election.mts'
import type { PrivateUser } from '@services/users/types'

describe('get-election', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('getPostElectionById', () => {
    it('retrieves post election by UUID', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-${random}`,
        createdById: user.id,
        markdown: 'Test content',
      })

      const election = await getPostElectionById(postId)

      expect(election).toBeDefined()
      expect(election).toMatchObject({
        __entity_type: 'post_election',
        id: postId,
        votes_score_net: expect.any(Number),
        votes_count_up: expect.any(Number),
        votes_count_down: expect.any(Number),
      })
    })

    it('returns null for non-existent UUID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'
      const election = await getPostElectionById(nonExistentId)

      expect(election).toBeNull()
    })
  })
})
