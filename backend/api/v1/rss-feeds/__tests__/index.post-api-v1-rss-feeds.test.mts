import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/rss-feeds', () => {
  let user: PrivateUser
  let originalPlaywright: string | undefined

  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    originalPlaywright = process.env.PLAYWRIGHT_TEST
    process.env.PLAYWRIGHT_TEST = 'true'
  })

  afterEach(() => {
    if (originalPlaywright === undefined) {
      delete process.env.PLAYWRIGHT_TEST
    } else {
      process.env.PLAYWRIGHT_TEST = originalPlaywright
    }
  })

  it('should return 401 for unauthenticated users', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const request = createRequest()
    await request
      .post('/api/v1/rss-feeds')
      .send({ rss_feed_url: `https://post-unauth-${random}.example.com/feed.xml` })
      .expect(401)
  })

  it('should create source and return 201 for any authenticated user', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/rss-feeds')
      .send({ rss_feed_url: `https://post-create-${random}.example.com/feed.xml` })
      .expect(201)

    expect(response.body.status).toBe('created')
    expect(response.body.rss_feed_id).toBeDefined()
    expect(response.body.topic_id).toBeDefined()
    expect(response.body.topic_slug).toBeDefined()
  })

  it('should return 200 and upvoted status for duplicate URL', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const feedUrl = `https://post-dup-${random}.example.com/feed.xml`
    const request = createRequest()
    await request.authenticateAs(user)

    await request.post('/api/v1/rss-feeds').send({ rss_feed_url: feedUrl }).expect(201)

    const response = await request
      .post('/api/v1/rss-feeds')
      .send({ rss_feed_url: feedUrl })
      .expect(200)

    expect(response.body.status).toBe('upvoted')
  })

  it('should reject unknown create fields', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/rss-feeds')
      .send({
        rss_feed_url: `https://post-strict-${random}.example.com/feed.xml`,
        title: 'Extra field',
      })
      .expect(400)
  })

  it('should return 422 for invalid URL', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request.post('/api/v1/rss-feeds').send({ rss_feed_url: 'not-a-url' }).expect(422)
  })

  it('should accept follow: false in body', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/rss-feeds')
      .send({
        rss_feed_url: `https://post-nofollow-${random}.example.com/feed.xml`,
        follow: false,
      })
      .expect(201)

    expect(response.body.status).toBe('created')
    expect(response.body.rss_feed_id).toBeDefined()
  })
})
