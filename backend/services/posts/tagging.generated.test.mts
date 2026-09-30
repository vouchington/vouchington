import { it, expect, describe, beforeAll } from 'vitest'
import { tagPostWithTopics } from './tagging.mts'
import {
  countPostRelatedTopics,
  createTestTopic,
  createTestUser,
  hasPostRelatedTopic,
  insertTestPost,
  mergeTopicForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('tagging.generated', () => {
  let testUser: PrivateUser
  let testTopic: Awaited<ReturnType<typeof createTestTopic>>

  beforeAll(async () => {
    const random = Math.random().toString(36).slice(2, 15)
    testUser = await createTestUser({ administrator: true })
    testTopic = await createTestTopic({
      name: `Test Post Tagging Topic ${random}`,
      slug: `test-post-tagging-${random}`,
      user: testUser,
    })
  })
  describe('tagPostWithTopics', () => {
    it('tags post with multiple topics', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const topic2 = await createTestTopic({
        name: `Test Post Tagging Topic 2 ${random}`,
        slug: `test-post-tagging-2-${random}`,
        user: testUser,
      })
      const postId = await insertTestPost({
        title: `Test Post Tags ${random}`,
        slug: `test-post-tags-${random}`,
        createdById: testUser.id,
        markdown: 'Test content',
      })
      const result = await tagPostWithTopics(testUser, postId, [testTopic.slug, topic2.slug])

      expect(result.tagged).toContain(testTopic.slug)
      expect(result.tagged).toContain(topic2.slug)
      expect(result.errors.length).toBe(0)

      const count = await countPostRelatedTopics(postId)
      expect(count).toBe(2)
    })

    it('reports errors for invalid topics', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Test Post Mixed Tags ${random}`,
        slug: `test-post-mixed-tags-${random}`,
        createdById: testUser.id,
        markdown: 'Test content',
      })
      const result = await tagPostWithTopics(testUser, postId, [
        testTopic.slug,
        'nonexistent-topic',
      ])

      expect(result.tagged).toContain(testTopic.slug)
      expect(result.errors.length).toBe(1)
      expect(result.errors[0]).toContain('Topic not found')

      const hasRelation = await hasPostRelatedTopic(postId, testTopic.id)
      expect(hasRelation).toBe(true)
    })

    it('redirects a merged-away source slug to its destination topic', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const source = await createTestTopic({
        name: `Merge Source ${random}`,
        slug: `merge-source-${random}`,
        user: testUser,
      })
      const destination = await createTestTopic({
        name: `Merge Dest ${random}`,
        slug: `merge-dest-${random}`,
        user: testUser,
      })
      await mergeTopicForTest(source.id, destination.id, testUser.id)

      const postId = await insertTestPost({
        title: `Test Post Merged Tag ${random}`,
        slug: `test-post-merged-tag-${random}`,
        createdById: testUser.id,
        markdown: 'Test content',
      })
      const result = await tagPostWithTopics(testUser, postId, [source.slug])

      expect(result.tagged).toContain(source.slug)
      expect(result.errors.length).toBe(0)

      const hasRelation = await hasPostRelatedTopic(postId, destination.id)
      expect(hasRelation).toBe(true)
    })

    it('dedupes when both a merged source slug and its destination slug are requested together', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const source = await createTestTopic({
        name: `Merge Dedup Source ${random}`,
        slug: `merge-dedup-source-${random}`,
        user: testUser,
      })
      const destination = await createTestTopic({
        name: `Merge Dedup Dest ${random}`,
        slug: `merge-dedup-dest-${random}`,
        user: testUser,
      })
      await mergeTopicForTest(source.id, destination.id, testUser.id)

      const postId = await insertTestPost({
        title: `Test Post Merged Dedup Tag ${random}`,
        slug: `test-post-merged-dedup-tag-${random}`,
        createdById: testUser.id,
        markdown: 'Test content',
      })
      const result = await tagPostWithTopics(testUser, postId, [source.slug, destination.slug])

      expect(result.tagged).toContain(source.slug)
      expect(result.tagged).toContain(destination.slug)
      expect(result.errors.length).toBe(0)

      const count = await countPostRelatedTopics(postId)
      expect(count).toBe(1)
    })
  })
})
