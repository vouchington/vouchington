import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  insertTestTopic,
  insertTestRssFeed,
  createTestUser,
  getRssFeedIgnoreRobotsTxtForTest,
  getRssFeedUnreliableStatusCodesForTest,
} from '@voucha/test-helpers'

describe('PATCH /api/v1/rss-feeds/:id — ignore_robots_txt admin field', () => {
  it('admin can set ignore_robots_txt to true', async () => {
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Robots True Topic ${random}`,
      slug: `robots-true-topic-${random}`,
      createdById: admin!.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Robots True Feed ${random}`,
    })
    const request = createRequest()
    await request.authenticateAs(admin!)

    await request.patch(`/api/v1/rss-feeds/${feedId}`).send({ ignore_robots_txt: true }).expect(200)

    expect(await getRssFeedIgnoreRobotsTxtForTest(feedId)).toBe(true)
  })

  it('admin can set ignore_robots_txt to false', async () => {
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Robots False Topic ${random}`,
      slug: `robots-false-topic-${random}`,
      createdById: admin!.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Robots False Feed ${random}`,
    })
    const request = createRequest()
    await request.authenticateAs(admin!)

    await request
      .patch(`/api/v1/rss-feeds/${feedId}`)
      .send({ ignore_robots_txt: false })
      .expect(200)

    expect(await getRssFeedIgnoreRobotsTxtForTest(feedId)).toBe(false)
  })

  it('admin can clear ignore_robots_txt by setting it to null', async () => {
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Robots Null Topic ${random}`,
      slug: `robots-null-topic-${random}`,
      createdById: admin!.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Robots Null Feed ${random}`,
    })
    const request = createRequest()
    await request.authenticateAs(admin!)

    // First set it
    await request.patch(`/api/v1/rss-feeds/${feedId}`).send({ ignore_robots_txt: true }).expect(200)

    // Then clear it
    await request.patch(`/api/v1/rss-feeds/${feedId}`).send({ ignore_robots_txt: null }).expect(200)

    expect(await getRssFeedIgnoreRobotsTxtForTest(feedId)).toBeNull()
  })

  it('non-admin gets 403 when trying to set ignore_robots_txt', async () => {
    const regularUser = await createTestUser()
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Robots Unauth Topic ${random}`,
      slug: `robots-unauth-topic-${random}`,
      createdById: admin!.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Robots Unauth Feed ${random}`,
    })
    const request = createRequest()
    await request.authenticateAs(regularUser!)

    await request.patch(`/api/v1/rss-feeds/${feedId}`).send({ ignore_robots_txt: true }).expect(403)
  })

  it('admin gets 422 when ignore_robots_txt is not a boolean or null', async () => {
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Robots Bad Topic ${random}`,
      slug: `robots-bad-topic-${random}`,
      createdById: admin!.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Robots Bad Feed ${random}`,
    })
    const request = createRequest()
    await request.authenticateAs(admin!)

    await request
      .patch(`/api/v1/rss-feeds/${feedId}`)
      .send({ ignore_robots_txt: 'yes' })
      .expect(422)
  })

  it('admin can set unreliable_status_codes to sorted unique 4xx values', async () => {
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Unreliable Codes Topic ${random}`,
      slug: `unreliable-codes-topic-${random}`,
      createdById: admin!.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Unreliable Codes Feed ${random}`,
    })
    const request = createRequest()
    await request.authenticateAs(admin!)

    await request
      .patch(`/api/v1/rss-feeds/${feedId}`)
      .send({ unreliable_status_codes: [410, 404, 404] })
      .expect(200)

    expect(await getRssFeedUnreliableStatusCodesForTest(feedId)).toEqual([404, 410])
  })

  it('admin can set unreliable_status_codes to an empty override array', async () => {
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Unreliable Empty Topic ${random}`,
      slug: `unreliable-empty-topic-${random}`,
      createdById: admin!.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Unreliable Empty Feed ${random}`,
    })
    const request = createRequest()
    await request.authenticateAs(admin!)

    await request
      .patch(`/api/v1/rss-feeds/${feedId}`)
      .send({ unreliable_status_codes: [] })
      .expect(200)

    expect(await getRssFeedUnreliableStatusCodesForTest(feedId)).toEqual([])
  })

  it('admin can clear unreliable_status_codes by setting it to null', async () => {
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Unreliable Null Topic ${random}`,
      slug: `unreliable-null-topic-${random}`,
      createdById: admin!.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Unreliable Null Feed ${random}`,
    })
    const request = createRequest()
    await request.authenticateAs(admin!)

    await request
      .patch(`/api/v1/rss-feeds/${feedId}`)
      .send({ unreliable_status_codes: [404] })
      .expect(200)
    await request
      .patch(`/api/v1/rss-feeds/${feedId}`)
      .send({ unreliable_status_codes: null })
      .expect(200)

    expect(await getRssFeedUnreliableStatusCodesForTest(feedId)).toBeNull()
  })

  it('non-admin gets 403 when trying to set unreliable_status_codes', async () => {
    const regularUser = await createTestUser()
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Unreliable Unauth Topic ${random}`,
      slug: `unreliable-unauth-topic-${random}`,
      createdById: admin!.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Unreliable Unauth Feed ${random}`,
    })
    const request = createRequest()
    await request.authenticateAs(regularUser!)

    await request
      .patch(`/api/v1/rss-feeds/${feedId}`)
      .send({ unreliable_status_codes: [404] })
      .expect(403)
  })

  it('admin gets 400 when unreliable_status_codes contains a non-4xx status', async () => {
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Unreliable Bad Topic ${random}`,
      slug: `unreliable-bad-topic-${random}`,
      createdById: admin!.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Unreliable Bad Feed ${random}`,
    })
    const request = createRequest()
    await request.authenticateAs(admin!)

    await request
      .patch(`/api/v1/rss-feeds/${feedId}`)
      .send({ unreliable_status_codes: [500] })
      .expect(400)
  })
})
