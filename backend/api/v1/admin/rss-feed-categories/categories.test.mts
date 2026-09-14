import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  insertUnmappedRssFeedItemCategory,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('rss-feed-categories', () => {
  const r = () => randomUUID().slice(0, 8)

  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  // Fetches all pages via cursor — a count-1 category can fall off page 1 on a dirty DB (#4842).
  type ApiCategory = { category_text: string; item_count: number; rejected: boolean }
  async function fetchAllCategories(
    request: ReturnType<typeof createRequest>,
    query: Record<string, string> = {},
  ): Promise<ApiCategory[]> {
    const all: ApiCategory[] = []
    let after: string | undefined
    for (;;) {
      const params = new URLSearchParams({ ...query, limit: '100' })
      if (after) params.set('after', after)
      const res = await request.get(`/api/v1/rss-feed-categories?${params}`).expect(200)
      all.push(...(res.body.results as ApiCategory[]))
      if (!res.body.page_info.has_next_page) break
      after = res.body.page_info.end_cursor as string
      expect(after).toBeTypeOf('string')
    }
    return all
  }

  async function createCategory(categoryText: string): Promise<string> {
    const topic = await createTestTopic({ user: admin })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    await insertUnmappedRssFeedItemCategory(item.id, categoryText)
    return topic.id
  }

  describe('GET /api/v1/rss-feed-categories', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/rss-feed-categories').expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/rss-feed-categories').expect(403)
    })

    it('returns 200 with correct shape for admin', async () => {
      const suffix = r()
      await createCategory(`api-test-cat-${suffix}`)

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/rss-feed-categories').expect(200)

      expect(response.body).toHaveProperty('results')
      expect(response.body).toHaveProperty('page_info')
      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.page_info).toHaveProperty('has_next_page')
      expect(response.body.page_info).toHaveProperty('start_cursor')
      expect(response.body.page_info).toHaveProperty('end_cursor')

      const found = (await fetchAllCategories(request)).find(
        c => c.category_text === `api-test-cat-${suffix}`,
      )
      expect(found).toBeDefined()
      expect(found!.item_count).toBeGreaterThanOrEqual(1)
      expect(found!.rejected).toBe(false)
    })

    it('returns only pending by default (no rejected)', async () => {
      const suffix = r()
      const pendingCat = `pending-default-${suffix}`
      const rejectedCat = `rejected-default-${suffix}`
      await createCategory(pendingCat)
      await createCategory(rejectedCat)

      const rejectRequest = createRequest()
      await rejectRequest.authenticateAs(admin)
      await rejectRequest
        .post('/api/v1/rss-feed-categories/rejections')
        .send({ category_text: rejectedCat })
        .expect(201)

      const request = createRequest()
      await request.authenticateAs(admin)
      const texts = (await fetchAllCategories(request)).map(c => c.category_text)
      expect(texts).toContain(pendingCat)
      expect(texts).not.toContain(rejectedCat)
    })

    it('returns rejected categories when status=rejected', async () => {
      const suffix = r()
      const rejectedCat = `status-rejected-${suffix}`
      await createCategory(rejectedCat)

      const rejectRequest = createRequest()
      await rejectRequest.authenticateAs(admin)
      await rejectRequest
        .post('/api/v1/rss-feed-categories/rejections')
        .send({ category_text: rejectedCat })
        .expect(201)

      const request = createRequest()
      await request.authenticateAs(admin)
      const texts = (await fetchAllCategories(request, { status: 'rejected' })).map(
        c => c.category_text,
      )
      expect(texts).toContain(rejectedCat)
    })
  })

  describe('POST /api/v1/rss-feed-categories/rejections', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .post('/api/v1/rss-feed-categories/rejections')
        .send({ category_text: 'news' })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .post('/api/v1/rss-feed-categories/rejections')
        .send({ category_text: 'news' })
        .expect(403)
    })

    it('returns 201 when admin rejects a category', async () => {
      const suffix = r()
      const categoryText = `reject-201-${suffix}`
      await createCategory(categoryText)

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .post('/api/v1/rss-feed-categories/rejections')
        .send({ category_text: categoryText })
        .expect(201)

      expect(response.body).toEqual({ ok: true })
    })

    it('returns 201 on duplicate (idempotent)', async () => {
      const suffix = r()
      const categoryText = `reject-idempotent-${suffix}`
      await createCategory(categoryText)

      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/rss-feed-categories/rejections')
        .send({ category_text: categoryText })
        .expect(201)

      await request
        .post('/api/v1/rss-feed-categories/rejections')
        .send({ category_text: categoryText })
        .expect(201)
    })

    it('returns 422 when category_text is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post('/api/v1/rss-feed-categories/rejections').send({}).expect(422)
    })
  })

  describe('DELETE /api/v1/rss-feed-categories/rejections', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .delete('/api/v1/rss-feed-categories/rejections')
        .send({ category_text: 'news' })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .delete('/api/v1/rss-feed-categories/rejections')
        .send({ category_text: 'news' })
        .expect(403)
    })

    it('returns 204 when admin un-rejects a category', async () => {
      const suffix = r()
      const categoryText = `unreject-204-${suffix}`
      await createCategory(categoryText)

      const request = createRequest()
      await request.authenticateAs(admin)

      // First reject it
      await request
        .post('/api/v1/rss-feed-categories/rejections')
        .send({ category_text: categoryText })
        .expect(201)

      // Then un-reject it
      await request
        .delete('/api/v1/rss-feed-categories/rejections')
        .send({ category_text: categoryText })
        .expect(204)
    })

    it('returns 422 when category_text is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.delete('/api/v1/rss-feed-categories/rejections').send({}).expect(422)
    })
  })

  describe('POST /api/v1/rss-feed-categories/assignments', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .post('/api/v1/rss-feed-categories/assignments')
        .send({ category_text: 'test', topic_id: randomUUID() })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const topic = await createTestTopic({ user: admin })
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .post('/api/v1/rss-feed-categories/assignments')
        .send({ category_text: 'test', topic_id: topic.id })
        .expect(403)
    })

    it('returns 200 with { updated } when admin assigns a category to a topic', async () => {
      const suffix = r()
      const categoryText = `assign-api-${suffix}`
      const topicId = await createCategory(categoryText)

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .post('/api/v1/rss-feed-categories/assignments')
        .send({ category_text: categoryText, topic_id: topicId })
        .expect(200)

      expect(response.body).toHaveProperty('updated')
      expect(typeof response.body.updated).toBe('number')
      expect(response.body.updated).toBeGreaterThanOrEqual(1)
    })

    it('returns 422 when category_text is missing', async () => {
      const topic = await createTestTopic({ user: admin })
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/rss-feed-categories/assignments')
        .send({ topic_id: topic.id })
        .expect(422)
    })

    it('returns 422 when topic_id is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/rss-feed-categories/assignments')
        .send({ category_text: 'test-cat' })
        .expect(422)
    })

    it('returns 422 when topic_id is not a valid UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .post('/api/v1/rss-feed-categories/assignments')
        .send({ category_text: 'test-cat', topic_id: 'not-a-uuid' })
        .expect(422)
    })
  })
})
