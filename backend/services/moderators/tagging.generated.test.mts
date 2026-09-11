import { it, expect, describe, beforeAll } from 'vitest'
import { tagPostWithTopicForModerators, tagPostWithTopicsForModerators } from './tagging.mts'
import { upsertTopic } from '@services/topics'
import { createTestUser, hasPostRelatedTopic, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Topic } from '@services/topics/types'

describe('tagging.generated', () => {
  let testUser: PrivateUser
  let testTopic: Topic

  beforeAll(async () => {
    const random = Math.random().toString(36).slice(2, 15)
    testUser = await createTestUser({ administrator: true })
    testTopic = await upsertTopic(`Test Tagging Topic ${random}`, `test-tagging-topic-${random}`)
  })
  describe('tagPostWithTopicForModerators', () => {
    it('tags post with topic successfully', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-${random}`,
        createdById: testUser.id,
        markdown: 'Test content',
      })
      const result = await tagPostWithTopicForModerators(testUser, postId, testTopic.slug)

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()

      const hasRelation = await hasPostRelatedTopic(postId, testTopic.id)
      expect(hasRelation).toBe(true)
    })

    it('returns error for invalid topic', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-invalid-topic-${random}`,
        createdById: testUser.id,
        markdown: 'Test content',
      })
      const result = await tagPostWithTopicForModerators(testUser, postId, 'nonexistent-topic-slug')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Topic not found')
    })
  })

  describe('tagPostWithTopicsForModerators', () => {
    it('tags post with multiple topics', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topic2 = await upsertTopic(
        `Test Tagging Topic 2 ${random}`,
        `test-tagging-topic-2-${random}`,
      )
      const postId = await insertTestPost({
        title: `Test Post Multi ${random}`,
        slug: `test-post-multi-${random}`,
        createdById: testUser.id,
        markdown: 'Test content',
      })
      const result = await tagPostWithTopicsForModerators(testUser, postId, [
        testTopic.slug,
        topic2.slug,
      ])

      expect(result.success).toBe(true)
      expect(result.tagged).toContain(testTopic.slug)
      expect(result.tagged).toContain(topic2.slug)
      expect(result.errors.length).toBe(0)
    })

    it('reports errors for invalid topics', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Test Post Mixed ${random}`,
        slug: `test-post-mixed-${random}`,
        createdById: testUser.id,
        markdown: 'Test content',
      })
      const result = await tagPostWithTopicsForModerators(testUser, postId, [
        testTopic.slug,
        'nonexistent-topic',
      ])

      expect(result.tagged).toContain(testTopic.slug)
      expect(result.errors.length).toBe(1)
      expect(result.errors[0]).toContain('Topic not found')
    })
  })
})
