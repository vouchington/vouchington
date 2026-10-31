import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import type { PostMetrics } from '@voucha/types/entities/post'

describe('GET /api/v1/posts/:idOrSlug metrics cache', () => {
  it('reads post metrics by the resolved post id so a warm id entry serves a slug request', async () => {
    const creator = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    const slug = `metrics-cache-${suffix}`
    const postId = await insertTestPost({
      title: `Metrics cache ${suffix}`,
      slug,
      createdById: creator.id,
      markdown: 'Metrics cache body',
    })
    const cachedMetrics: PostMetrics = {
      __entity_type: 'post_metrics',
      id: postId,
      count: { descendants: 41, children: 7, ancestors: 0 },
      updated_at: new Date('2026-01-02T03:04:05.000Z'),
      bookmarks: { follow: 0, save: 0 },
    }
    await caches.post_metrics.set(postId, cachedMetrics)

    try {
      const response = await createRequest().get(`/api/v1/posts/${slug}`).expect(200)

      expect(response.body.post.id).toBe(postId)
      expect(response.body.post_metrics).toMatchObject({
        id: postId,
        count: { descendants: 41, children: 7, ancestors: 0 },
      })
    } finally {
      await caches.post_metrics.delete(postId)
    }
  })
})
