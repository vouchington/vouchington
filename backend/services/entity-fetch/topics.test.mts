import { it, expect, describe, beforeAll } from 'vitest'
import { fetchTopicsWithMetadata } from './topics.mts'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import type { PrivateUser } from '@services/users/types'

describe('topics', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('fetchTopicsWithMetadata', () => {
    it('returns empty objects for empty ids', async () => {
      const result = await fetchTopicsWithMetadata([])

      expect(result.entities).toEqual({})
      expect(result.entity_metrics).toEqual({})
      expect(result.bookmarks).toBeUndefined()
      expect(result.election_votes).toBeUndefined()
    })

    it('returns indexed entities and metrics', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topicId = await insertTestTopic({
        name: `Topic ${random}`,
        slug: `topic-${random}`,
        createdById: user.id,
      })
      const result = await fetchTopicsWithMetadata([topicId])

      expect(result.entities[topicId]).toBeDefined()
      expect(result.entities[topicId].id).toBe(topicId)
      expect(result.entity_metrics[topicId]).toBeDefined()
      expect(result.bookmarks).toBeUndefined()
    })

    it('includes bookmarks for authenticated user', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topicId = await insertTestTopic({
        name: `Topic ${random}`,
        slug: `topic-${random}`,
        createdById: user.id,
      })
      await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
      const result = await fetchTopicsWithMetadata([topicId], user)

      expect(result.bookmarks).toBeDefined()
      expect(result.bookmarks![topicId].follow).toBe(true)
    })
  })
})
