import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestTopic,
  insertTestRssFeed,
  createTestRssFeedItemWithUrl,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/podcast-episodes/:id/chapters', () => {
  let user: PrivateUser
  let rssFeedId: string

  beforeAll(async () => {
    user = await createTestUser()
    const random = crypto.randomUUID().slice(0, 8)
    const topicId = await insertTestTopic({
      name: `Podcast Chapters Topic ${random}`,
      slug: `podcast-chapters-topic-${random}`,
      createdById: user.id,
    })
    rssFeedId = await insertTestRssFeed({
      topicId,
      title: `Podcast Chapters Feed ${random}`,
      feedType: 'podcast',
    })
  })

  it('returns chapters for anonymous users', async () => {
    const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
    const request = createRequest()
    const response = await request.get(`/api/v1/podcast-episodes/${episodeId}/chapters`).expect(200)

    expect(response.body).toEqual({ chapters: [] })
    expect(response.headers['cache-control']).toMatch(/^public, max-age=/)
  })

  it('returns chapters for authenticated users', async () => {
    const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get(`/api/v1/podcast-episodes/${episodeId}/chapters`).expect(200)

    expect(response.body).toEqual({ chapters: [] })
    expect(response.headers['cache-control']).toBeUndefined()
  })

  it('returns 422 for an invalid UUID', async () => {
    const request = createRequest()
    await request.get('/api/v1/podcast-episodes/not-a-uuid/chapters').expect(422)
  })

  it('returns an empty list for a non-existent episode UUID', async () => {
    const request = createRequest()
    await request
      .get('/api/v1/podcast-episodes/01970000-0000-7000-8000-000000000000/chapters')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ chapters: [] })
      })
  })
})
