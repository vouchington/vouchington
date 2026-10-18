import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { insertTestTopic, insertTestRssFeed, createTestUser } from '@voucha/test-helpers'

describe('PATCH /api/v1/rss-feeds/:id response', () => {
  it('returns the written feed, including field and state changes, matching a later read', async () => {
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Patch Response Topic ${random}`,
      slug: `patch-response-topic-${random}`,
      createdById: admin!.id,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `Before ${random}` })
    const request = createRequest()
    await request.authenticateAs(admin!)

    const patched = await request
      .patch(`/api/v1/rss-feeds/${feedId}`)
      .send({ title: `After ${random}`, is_enabled: false, discoverable: false, reason: 'test' })
      .expect(200)

    expect(patched.body.rss_feed).toMatchObject({
      id: feedId,
      title: `After ${random}`,
      is_enabled: false,
    })
    const read = await request.get(`/api/v1/rss-feeds/${feedId}`).expect(200)
    expect(patched.body.rss_feed).toEqual(read.body.rss_feed)
  })

  it('returns 404 for an unknown feed', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin!)
    await request
      .patch('/api/v1/rss-feeds/00000000-0000-4000-8000-000000000000')
      .send({ title: 'x' })
      .expect(404)
  })
})
