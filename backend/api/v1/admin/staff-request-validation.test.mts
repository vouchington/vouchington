import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestStory } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

type Method = 'post' | 'put' | 'patch' | 'delete'

const ID = randomUUID()

// One malformed body per staff route. Plan #285 ordering: anonymous callers get 401 with no schema
// diagnostic, callers without the role get 403, and only a permitted caller sees the 422.
const MALFORMED: Array<[string, Method, string, unknown]> = [
  ['admin warnings', 'post', '/api/v1/admin/warnings', { userId: ID }],
  ['topic-claim rejection', 'post', `/api/v1/admin/topic-claims/${ID}/rejection`, {}],
  ['topic-claim revocation', 'post', `/api/v1/admin/topic-claims/${ID}/revocation`, { reason: 1 }],
  ['topic import', 'post', '/api/v1/imports/topics', {}],
  ['category assignment', 'post', '/api/v1/rss-feed-categories/assignments', { topic_id: ID }],
  ['category rejection', 'post', '/api/v1/rss-feed-categories/rejections', {}],
  ['category rejection removal', 'delete', '/api/v1/rss-feed-categories/rejections', {}],
  ['official story item', 'put', `/api/v1/stories/${ID}/official`, { rss_feed_item_id: 5 }],
  ['story title', 'patch', `/api/v1/stories/${ID}`, { title: 5 }],
  [
    'identity verification retry',
    'post',
    `/api/v1/admin/users/${ID}/identity-verification-attempts`,
    {},
  ],
  ['crawler referral program', 'put', '/api/v1/crawlers/referral-program', { hostname_id: 'x' }],
  ['crawler update', 'patch', `/api/v1/crawlers/${ID}`, { priority: 'high' }],
  ['psql job', 'post', '/api/v1/psql/jobs', { type: 'dropEverything' }],
  ['valkey bloom rebuild', 'post', '/api/v1/valkey/bloom-filters/rebuild', { filter: 'nope' }],
  ['valkey cache clear', 'post', '/api/v1/valkey/caches/clear', {}],
  ['valkey flush', 'post', '/api/v1/valkey/flush', { concern: 'everything' }],
]

describe('staff route request contract ordering', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  it.each(MALFORMED)(
    '%s: 401 without a schema diagnostic for anonymous',
    async (_l, method, url, body) => {
      const request = createRequest()
      const response = await request[method](url).send(body as object)

      expect(response.status).toBe(401)
      expect(response.text).not.toMatch(/schema|must be|required|invalid/i)
    },
  )

  it.each(MALFORMED)('%s: 403 for a caller without the role', async (_l, method, url, body) => {
    const request = createRequest()
    await request.authenticateAs(regularUser)

    await request[method](url)
      .send(body as object)
      .expect(403)
  })

  it.each(MALFORMED)('%s: 422 for staff before any service call', async (_l, method, url, body) => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request[method](url)
      .send(body as object)
      .expect(422)
  })

  it('does not issue a warning for a malformed body', async () => {
    const target = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.post('/api/v1/admin/warnings').send({ userId: target.id }).expect(422)
    await request
      .post('/api/v1/admin/warnings')
      .send({ userId: target.id, reason: 'spam', unknown: true })
      .expect(422)

    const listed = await request.get(`/api/v1/admin/warnings?userId=${target.id}`).expect(200)
    expect(listed.body.warnings).toEqual([])
  })

  it('still issues a warning for a valid body', async () => {
    const target = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post('/api/v1/admin/warnings')
      .send({ userId: target.id, reason: 'Repeated spam after two reminders' })
      .expect(201)

    const listed = await request.get(`/api/v1/admin/warnings?userId=${target.id}`).expect(200)
    expect(listed.body.warnings).toHaveLength(1)
  })

  it('does not rename a story for a malformed body', async () => {
    const story = await insertTestStory({ title: 'Original title' })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.patch(`/api/v1/stories/${story.id}`).send({ title: 5 }).expect(422)
    await request.patch(`/api/v1/stories/${story.id}`).send({ title: 'x', extra: 1 }).expect(422)

    const fetched = await request.get(`/api/v1/stories/${story.id}`).expect(200)
    expect(fetched.body.story.title).toBe('Original title')
  })
})
