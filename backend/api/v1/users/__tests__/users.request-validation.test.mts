import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, safeUsername } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const collections = [
  'posts/saved',
  'users/following',
  'users/blocked',
  'rss-feeds/following',
  'rss-feed-items/saved',
  'urls/saved',
  'domains/blocked',
  'topics/following',
  'communities/member',
] as const

describe('user routes - request contract validation', () => {
  let owner: PrivateUser
  let stranger: PrivateUser

  beforeAll(async () => {
    owner = await createTestUser({ username: safeUsername('users-validation-owner') })
    stranger = await createTestUser({ username: safeUsername('users-validation-stranger') })
  }, 60_000)

  describe('anonymous callers', () => {
    it.each([
      ['get', '/posts/saved?limit=abc'],
      ['get', '/urls/saved?after=a&after=b'],
      ['get', '/domains/blocked?limit=abc'],
      ['get', '/rss-feed-items/saved?limit=abc'],
      ['patch', ''],
    ] as const)('%s %s returns 401 without a validation diagnostic', async (method, suffix) => {
      const request = createRequest()
      const path = `/api/v1/users/${owner.id}${suffix}`
      const response = await request[method](path).send({ extra: true }).expect(401)
      expect(response.body.message).toBe('Unauthorized')
    })

    it('returns 401 for a malformed user search without a validation diagnostic', async () => {
      const response = await createRequest().get('/api/v1/users?q=abc&limit=abc').expect(401)
      expect(response.body.message).toBe('Unauthorized')
    })

    it('returns 401 for a malformed data-request stream without a validation diagnostic', async () => {
      const path = `/api/v1/users/${owner.id}/data-request/stream?request_id=not-a-uuid`
      const response = await createRequest().get(path).expect(401)
      expect(response.body.message).toBe('Unauthorized')
    })
  })

  describe('collection queries', () => {
    it.each(collections)('keeps the parser 400 for a malformed limit on %s', async collection => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .get(`/api/v1/users/${owner.id}/${collection}`)
        .query({ limit: 'abc' })
        .expect(400)
    })

    it.each(collections)('keeps the parser 400 for a repeated cursor on %s', async collection => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .get(`/api/v1/users/${owner.id}/${collection}`)
        .query({ after: ['a', 'b'] })
        .expect(400)
    })

    it.each(collections)('keeps serving a valid limit on %s', async collection => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request
        .get(`/api/v1/users/${owner.id}/${collection}`)
        .query({ limit: 5 })
        .expect(200)
      expect(response.body.results).toEqual([])
    })

    it('keeps the parser 400 on public collections for anonymous callers', async () => {
      await createRequest()
        .get(`/api/v1/users/${owner.id}/topics/following`)
        .query({ limit: 'abc' })
        .expect(400)
    })

    it('returns 403 before any query diagnostic on another user private collection', async () => {
      const request = createRequest()
      await request.authenticateAs(stranger)
      const response = await request
        .get(`/api/v1/users/${owner.id}/posts/saved`)
        .query({ limit: 'abc' })
        .expect(403)
      expect(response.body.message).toBe('Forbidden')
    })

    it('returns 422 for a repeated search term on the user relation collection', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .get(`/api/v1/users/${owner.id}/users/following`)
        .query({ q: ['a', 'b'] })
        .expect(422)
    })

    it.each([
      ['rss-feeds/following', { feed_type: 'bogus' }],
      ['rss-feed-items/saved', { media_type: 'bogus' }],
      ['rss-feeds/bogus', {}],
      ['posts/bogus', {}],
    ] as const)('keeps the 400 for an unknown value on %s', async (collection, query) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request.get(`/api/v1/users/${owner.id}/${collection}`).query(query).expect(400)
    })

    it('keeps serving known feed and media type filters', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .get(`/api/v1/users/${owner.id}/rss-feeds/following`)
        .query({ feed_type: 'podcast' })
        .expect(200)
      await request
        .get(`/api/v1/users/${owner.id}/rss-feed-items/saved`)
        .query({ media_type: 'audio' })
        .expect(200)
    })
  })

  describe('user search', () => {
    it('keeps public username lookup ahead of a search term and unused pagination', async () => {
      const response = await createRequest()
        .get('/api/v1/users')
        .query({ username: owner.username, q: 'not-a-match', limit: 'bad' })
        .expect(200)
      expect(response.body.user.id).toBe(owner.id)
    })

    it('uses the first repeated search term after authentication', async () => {
      const request = createRequest()
      await request.authenticateAs(stranger)
      const response = await request
        .get('/api/v1/users')
        .query({ q: [owner.username, 'not-a-match'] })
        .expect(200)
      expect(response.body.results.some((user: { id: string }) => user.id === owner.id)).toBe(true)
    })

    it('keeps authentication ahead of malformed pagination with an empty username', async () => {
      const response = await createRequest()
        .get('/api/v1/users?username=&q=abc&limit=bad')
        .expect(401)
      expect(response.body.message).toBe('Unauthorized')
    })

    it.each([
      ['a malformed limit', { q: 'abc', limit: 'abc' }],
      ['a repeated cursor', { q: 'abc', after: ['a', 'b'] }],
    ])('keeps the parser 400 for %s', async (_name, query) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request.get('/api/v1/users').query(query).expect(400)
    })

    it('keeps serving a valid search', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request
        .get('/api/v1/users')
        .query({ q: 'users-validation', limit: 5 })
        .expect(200)
      expect(response.body.results).toBeInstanceOf(Array)
    })
  })

  describe('PATCH /api/v1/users/:idOrSlug', () => {
    it.each([
      ['an unknown field', { extra: true }],
      ['an unknown visibility', { follows_visibility: 'secret' }],
      ['a string boolean', { is_engagement_emails_enabled: 'yes' }],
      ['a numeric username', { username: 5 }],
      ['an array body', []],
    ])('returns 422 for %s without changing the user', async (_name, body) => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request.patch(`/api/v1/users/${owner.id}`).send(body).expect(422)
      const response = await request.get(`/api/v1/users/${owner.id}`).expect(200)
      expect(response.body.user.username).toBe(owner.username)
    })

    it('returns a redacted diagnostic', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request
        .patch(`/api/v1/users/${owner.id}`)
        .send({ extra: true })
        .expect(422)
      expect(response.body.message).toBe('Invalid request body')
    })

    it('keeps applying a valid body', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request
        .patch(`/api/v1/users/${owner.id}`)
        .send({ is_engagement_emails_enabled: false })
        .expect(200)
      expect(response.body.user.id).toBe(owner.id)
    })

    it('keeps returning 403 for a valid body from another user', async () => {
      const request = createRequest()
      await request.authenticateAs(stranger)
      await request
        .patch(`/api/v1/users/${owner.id}`)
        .send({ is_engagement_emails_enabled: false })
        .expect(403)
    })
  })

  describe('GET /api/v1/users/:idOrSlug/data-request/stream', () => {
    it('returns 422 for a malformed request id instead of a database error', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request
        .get(`/api/v1/users/${owner.id}/data-request/stream`)
        .query({ request_id: 'not-a-uuid' })
        .expect(422)
      expect(response.body.message).toBe('Invalid request ID')
    })

    it('keeps returning 404 for an unknown request id', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)
      await request
        .get(`/api/v1/users/${owner.id}/data-request/stream`)
        .query({ request_id: randomUUID() })
        .expect(404)
    })
  })
})
