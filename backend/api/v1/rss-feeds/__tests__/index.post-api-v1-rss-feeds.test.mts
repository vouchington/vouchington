import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'
import { processRssFeedImportRow } from '@services/user-import-export/rss-feed-imports'

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

  it('returns a pending import, then its status endpoint reports the created feed', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/rss-feeds')
      .send({ rss_feed_url: `https://post-create-${random}.example.com/feed.xml` })
      .expect(202)

    expect(response.body.import).toMatchObject({ total_rows: 1, pending_rows: 1 })
    expect(response.body.status_url).toBe(`/api/v1/my/import/rss-feeds/${response.body.import.id}`)
    expect(response.headers.location).toBe(response.body.status_url)
    const pending = await request.get(response.body.status_url).expect(200)
    expect(pending.body.rows).toMatchObject([{ status: 'pending' }])
    const otherRequest = createRequest()
    await otherRequest.authenticateAs(await createTestUser())
    await otherRequest.get(response.body.status_url).expect(404)
    await processRssFeedImportRow(response.body.import.id, pending.body.rows[0].id)
    const completed = await request.get(response.body.status_url).expect(200)
    expect(completed.body.rows).toMatchObject([
      { status: 'source_created', entity_id: expect.any(String) },
    ])
  })

  it('accepts duplicate submissions as independent pending imports', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const feedUrl = `https://post-dup-${random}.example.com/feed.xml`
    const request = createRequest()
    await request.authenticateAs(user)

    const first = await request
      .post('/api/v1/rss-feeds')
      .send({ rss_feed_url: feedUrl })
      .expect(202)

    const response = await request
      .post('/api/v1/rss-feeds')
      .send({ rss_feed_url: feedUrl })
      .expect(202)

    expect(response.body.import.id).not.toBe(first.body.import.id)
  })

  it('should reject unknown create fields with generated-schema 422', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/rss-feeds')
      .send({
        rss_feed_url: `https://post-strict-${random}.example.com/feed.xml`,
        title: 'Extra field',
      })
      .expect(422)
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
      .expect(202)

    expect(response.body.import.pending_rows).toBe(1)
  })
})
