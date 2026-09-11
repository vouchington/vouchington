import { it, expect, describe, beforeAll } from 'vitest'
import { getPostMetricsByAny } from './metrics.mts'
import { createTestUser, insertTestPost, updatePostUpdatedAt } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('metrics', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('getPostMetricsByAny', () => {
    it('retrieves metrics by UUID', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: `test-post-${random}`,
        createdById: user.id,
        markdown: 'Test content',
      })
      const metrics = await getPostMetricsByAny(postId)

      expect(metrics).toBeDefined()
      expect(metrics).toMatchObject({
        __entity_type: 'post_metrics',
        id: postId,
        count: {
          descendants: 0,
          children: 0,
          ancestors: 0,
        },
      })
      expect(metrics).not.toHaveProperty('election')
      expect(metrics?.updated_at).toBeInstanceOf(Date)
    })

    it('excludes unpublished descendants from public counts and freshness', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const rootUpdatedAt = new Date('2026-01-01T00:00:00.000Z')
      const publishedUpdatedAt = new Date('2026-01-02T00:00:00.000Z')
      const unpublishedUpdatedAt = new Date('2026-01-03T00:00:00.000Z')
      const rootId = await insertTestPost({
        title: `Metrics root ${random}`,
        slug: `metrics-root-${random}`,
        createdById: user.id,
        markdown: 'Root',
        createdAt: rootUpdatedAt,
      })
      const publishedId = await insertTestPost({
        title: '',
        slug: `metrics-published-${random}`,
        createdById: user.id,
        markdown: 'Published comment',
        postType: 'comment',
        rootId,
        parentId: rootId,
        createdAt: publishedUpdatedAt,
      })
      const unpublishedId = await insertTestPost({
        title: '',
        slug: `metrics-unpublished-${random}`,
        createdById: user.id,
        markdown: 'Unpublished comment',
        postType: 'comment',
        rootId,
        parentId: rootId,
        clearanceStatus: 'pending',
        createdAt: unpublishedUpdatedAt,
      })
      await Promise.all([
        updatePostUpdatedAt(rootId, rootUpdatedAt),
        updatePostUpdatedAt(publishedId, publishedUpdatedAt),
        updatePostUpdatedAt(unpublishedId, unpublishedUpdatedAt),
      ])

      const metrics = await getPostMetricsByAny(rootId)

      expect(metrics?.count).toMatchObject({ descendants: 1, children: 1 })
      expect(metrics?.updated_at).toEqual(publishedUpdatedAt)
    })

    it('counts only publicly eligible ancestors of a comment', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const rootId = await insertTestPost({
        title: `Ancestor root ${random}`,
        slug: `ancestor-root-${random}`,
        createdById: user.id,
        markdown: 'Root',
      })
      const pendingParentId = await insertTestPost({
        title: '',
        slug: `ancestor-pending-${random}`,
        createdById: user.id,
        markdown: 'Pending parent',
        postType: 'comment',
        rootId,
        parentId: rootId,
        clearanceStatus: 'pending',
      })
      const childId = await insertTestPost({
        title: '',
        slug: `ancestor-child-${random}`,
        createdById: user.id,
        markdown: 'Approved child',
        postType: 'comment',
        rootId,
        parentId: pendingParentId,
      })

      const metrics = await getPostMetricsByAny(childId)

      expect(metrics?.count.ancestors).toBe(1)
    })

    it('retrieves metrics by slug', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const slug = `test-post-${random}`
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug,
        createdById: user.id,
        markdown: 'Test content',
      })
      const metrics = await getPostMetricsByAny(slug)

      expect(metrics).toBeDefined()
      expect(metrics).toMatchObject({
        __entity_type: 'post_metrics',
        id: postId,
        count: {
          descendants: 0,
          children: 0,
          ancestors: 0,
        },
      })
      expect(metrics).not.toHaveProperty('election')
    })

    it('retrieves metrics by slug (case insensitive)', async () => {
      const random = Math.random().toString(36).slice(2, 15)
      const slug = `test-post-${random}`
      const postId = await insertTestPost({
        title: `Test Post ${random}`,
        slug: slug.toLowerCase(),
        createdById: user.id,
        markdown: 'Test content',
      })
      const metrics = await getPostMetricsByAny(slug.toLowerCase())

      expect(metrics).toBeDefined()
      expect(metrics?.id).toBe(postId)
    })

    it('returns null for non-existent UUID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000'
      const metrics = await getPostMetricsByAny(nonExistentId)

      expect(metrics).toBeNull()
    })

    it('returns null for non-existent slug', async () => {
      const nonExistentSlug = `non-existent-${Math.random().toString(36).slice(2, 15)}`
      const metrics = await getPostMetricsByAny(nonExistentSlug)

      expect(metrics).toBeNull()
    })

    it('throws error for invalid identifier', async () => {
      await expect(getPostMetricsByAny('invalid identifier!')).rejects.toThrow(
        /Invalid post identifier/,
      )
    })
  })
})
