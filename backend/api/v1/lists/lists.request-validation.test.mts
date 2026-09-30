import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createRandomString, createTestUser, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const malformedId = 'not-a-uuid'

describe('list routes - request contract validation', () => {
  let owner: PrivateUser
  let stranger: PrivateUser
  let listId: string
  let postId: string

  beforeAll(async () => {
    owner = await createTestUser()
    stranger = await createTestUser()
    postId = await insertTestPost({
      title: `List Validation ${createRandomString(8)}`,
      slug: `list-validation-${createRandomString(8)}`,
      createdById: owner.id,
      markdown: 'content',
    })
    const request = createRequest()
    await request.authenticateAs(owner)
    const created = await request
      .post('/api/v1/lists')
      .send({ name: `Validation ${createRandomString(8)}`, visibility: 'public' })
      .expect(201)
    listId = created.body.list.id
  }, 60_000)

  describe('anonymous callers', () => {
    it.each([
      ['get', '/api/v1/lists?limit=abc', undefined],
      ['post', '/api/v1/lists', { name: 5, extra: true }],
      ['patch', `/api/v1/lists/${malformedId}`, { extra: true }],
      ['delete', `/api/v1/lists/${malformedId}`, undefined],
      ['post', `/api/v1/lists/${malformedId}/import`, { community_slug: 5 }],
      ['post', `/api/v1/lists/${malformedId}/items/posts`, { post_id: malformedId }],
      ['delete', `/api/v1/lists/${malformedId}/items/posts/${malformedId}`, undefined],
      ['post', `/api/v1/lists/${malformedId}/items/rss-feed-items`, { extra: true }],
      ['delete', `/api/v1/lists/${malformedId}/items/rss-feed-items/${malformedId}`, undefined],
    ] as const)('%s %s returns 401 without a validation diagnostic', async (method, path, body) => {
      const response = await createRequest()[method](path).send(body).expect(401)
      expect(response.body.message).toBe('Unauthorized')
    })
  })

  describe('callers who cannot manage the list', () => {
    it.each([
      ['patch', { extra: true }],
      ['post', { community_slug: 5 }],
    ] as const)('returns 403 before any body diagnostic on %s', async (method, body) => {
      const request = createRequest()
      await request.authenticateAs(stranger)
      const path = method === 'patch' ? `/api/v1/lists/${listId}` : `/api/v1/lists/${listId}/import`
      const response = await request[method](path).send(body).expect(403)
      expect(response.body.message).toBe('Forbidden')
    })
  })

  describe('list collection', () => {
    it.each([
      ['a non-integer limit', { limit: 'abc' }],
      ['a zero limit', { limit: 0 }],
      ['an oversized limit', { limit: 101 }],
      ['a repeated cursor', { after: ['a', 'b'] }],
    ])('returns 422 for %s', async (_name, query) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request.get('/api/v1/lists').query(query).expect(422)
    })

    it('keeps serving a valid limit', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request.get('/api/v1/lists').query({ limit: 25 }).expect(200)
      expect(response.body.results.length).toBeGreaterThanOrEqual(1)
    })

    it.each([
      ['an unknown field', { name: 'x', extra: true }],
      ['an unknown visibility', { name: 'x', visibility: 'secret' }],
      ['a numeric name', { name: 5 }],
      ['a numeric description', { name: 'x', description: 5 }],
      ['an array body', []],
    ])('returns 422 for %s on create without creating a list', async (_name, body) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const before = await request.get('/api/v1/lists').query({ limit: 100 }).expect(200)
      await request.post('/api/v1/lists').send(body).expect(422)
      const after = await request.get('/api/v1/lists').query({ limit: 100 }).expect(200)
      expect(after.body.results).toHaveLength(before.body.results.length)
    })
  })

  describe('single list', () => {
    it.each([
      ['get', ''],
      ['patch', ''],
      ['delete', ''],
    ] as const)('%s returns 422 for a malformed list id', async (method, suffix) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request[method](`/api/v1/lists/${malformedId}${suffix}`).send({}).expect(422)
    })

    it.each([
      ['an unknown field', { extra: true }],
      ['an unknown visibility', { visibility: 'secret' }],
      ['a numeric name', { name: 5 }],
    ])('returns 422 for %s on update without changing the list', async (_name, body) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request.patch(`/api/v1/lists/${listId}`).send(body).expect(422)
      const fetched = await request.get(`/api/v1/lists/${listId}`).expect(200)
      expect(fetched.body.list.visibility).toBe('public')
    })
  })

  describe('list items', () => {
    it.each([
      ['a non-integer limit', { limit: 'abc' }],
      ['an unknown read flag', { read: 'maybe' }],
      ['a repeated media type', { media_type: ['a', 'b'] }],
    ])('returns 422 for %s without a lookup, even when anonymous', async (_name, query) => {
      await createRequest().get(`/api/v1/lists/${listId}/items`).query(query).expect(422)
    })

    it('returns 422 for a malformed list id', async () => {
      await createRequest().get(`/api/v1/lists/${malformedId}/items`).expect(422)
    })

    it('keeps serving valid filters', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .get(`/api/v1/lists/${listId}/items`)
        .query({ limit: 25, read: 'false', media_type: 'article' })
        .expect(200)
    })

    it.each([
      ['a missing post_id', {}],
      ['a malformed post_id', { post_id: malformedId }],
      ['an unknown field', { post_id: randomUUID(), extra: true }],
    ])('returns 422 for %s on post add without adding an item', async (_name, body) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const before = await request.get(`/api/v1/lists/${listId}/items`).expect(200)
      await request.post(`/api/v1/lists/${listId}/items/posts`).send(body).expect(422)
      const after = await request.get(`/api/v1/lists/${listId}/items`).expect(200)
      expect(after.body.results).toHaveLength(before.body.results.length)
    })

    it.each([
      ['a missing rss_feed_item_id', {}],
      ['a malformed rss_feed_item_id', { rss_feed_item_id: malformedId }],
      ['an unknown field', { rss_feed_item_id: randomUUID(), extra: true }],
    ])('returns 422 for %s on RSS item add', async (_name, body) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request.post(`/api/v1/lists/${listId}/items/rss-feed-items`).send(body).expect(422)
    })

    it('returns 422 for malformed item ids on removal and keeps a valid add working', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request.delete(`/api/v1/lists/${listId}/items/posts/${malformedId}`).expect(422)
      await request
        .delete(`/api/v1/lists/${listId}/items/rss-feed-items/${malformedId}`)
        .expect(422)
      await request
        .post(`/api/v1/lists/${listId}/items/posts`)
        .send({ post_id: postId })
        .expect(201)
    })

    it.each([
      ['a missing community_slug', {}],
      ['a numeric community_slug', { community_slug: 5 }],
      ['an unknown field', { community_slug: 'x', extra: true }],
    ])('returns 422 for %s on import', async (_name, body) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request.post(`/api/v1/lists/${listId}/import`).send(body).expect(422)
    })
  })
})
