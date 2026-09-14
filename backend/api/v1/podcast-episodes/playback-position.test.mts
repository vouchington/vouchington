import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestTopic,
  insertTestRssFeed,
  createTestRssFeedItemWithUrl,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET + PUT /api/v1/podcast-episodes/:id/playback-position', () => {
  let user: PrivateUser
  let otherUser: PrivateUser
  let rssFeedId: string

  beforeAll(async () => {
    user = await createTestUser()
    otherUser = await createTestUser()
    const rand = crypto.randomUUID().slice(0, 8)
    const topicId = await insertTestTopic({
      name: `Playback Pos Topic ${rand}`,
      slug: `playback-pos-topic-${rand}`,
      createdById: user.id,
    })
    rssFeedId = await insertTestRssFeed({ topicId, title: `Playback Pos Feed ${rand}` })
  })

  describe('GET /api/v1/podcast-episodes/:id/playback-position', () => {
    it('returns 401 when unauthenticated', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
      const request = createRequest()
      await request.get(`/api/v1/podcast-episodes/${episodeId}/playback-position`).expect(401)
    })

    it('returns 422 for an invalid UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get('/api/v1/podcast-episodes/not-a-uuid/playback-position').expect(422)
    })

    it('returns null playback_position when no position saved', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
      const request = createRequest()
      await request.authenticateAs(user)
      const res = await request
        .get(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .expect(200)

      expect(res.body).toEqual({ playback_position: null })
    })

    it('returns the saved position after a PUT', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .put(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .send({ position_seconds: 77.3 })
        .expect(204)

      const res = await request
        .get(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .expect(200)

      expect(res.body.playback_position).toMatchObject({
        position_seconds: 77.3,
        completed_at: null,
      })
    })

    it("is scoped to the authenticated user — does not expose another user's position", async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)

      const req1 = createRequest()
      await req1.authenticateAs(user)
      await req1
        .put(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .send({ position_seconds: 50 })
        .expect(204)

      const req2 = createRequest()
      await req2.authenticateAs(otherUser)
      const res = await req2
        .get(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .expect(200)

      expect(res.body.playback_position).toBeNull()
    })
  })

  describe('PUT /api/v1/podcast-episodes/:id/playback-position', () => {
    it('returns 401 when unauthenticated', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
      const request = createRequest()
      await request
        .put(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .send({ position_seconds: 10 })
        .expect(401)
    })

    it('returns 422 for an invalid UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .put('/api/v1/podcast-episodes/not-a-uuid/playback-position')
        .send({ position_seconds: 10 })
        .expect(422)
    })

    it('returns 415 when Content-Type is not JSON', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .put(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .set('Content-Type', 'text/plain')
        .send('position_seconds=10')
        .expect(415)
    })

    it('returns 400 when position_seconds is missing', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .put(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .send({})
        .expect(400)
    })

    it('returns 400 when position_seconds is negative', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .put(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .send({ position_seconds: -1 })
        .expect(400)
    })

    it('returns 400 when position_seconds is not a number', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .put(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .send({ position_seconds: 'abc' })
        .expect(400)
    })

    it('returns 204 on a valid write', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .put(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .send({ position_seconds: 30 })
        .expect(204)
    })

    it('returns 204 with completed: true and sets completed_at', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .put(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .send({ position_seconds: 3600, completed: true })
        .expect(204)

      const res = await request
        .get(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .expect(200)

      expect(res.body.playback_position.completed_at).not.toBeNull()
    })

    it('clears completed_at when replay progress is saved after completion', async () => {
      const { id: episodeId } = await createTestRssFeedItemWithUrl(rssFeedId)
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .put(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .send({ position_seconds: 3600, completed: true })
        .expect(204)

      await request
        .put(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .send({ position_seconds: 42.5, completed: false })
        .expect(204)

      const res = await request
        .get(`/api/v1/podcast-episodes/${episodeId}/playback-position`)
        .expect(200)

      expect(res.body.playback_position).toMatchObject({
        position_seconds: 42.5,
        completed_at: null,
      })
    })

    it('returns 404 for a non-existent episode UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .put(`/api/v1/podcast-episodes/01970000-0000-7000-8000-000000000000/playback-position`)
        .send({ position_seconds: 10 })
        .expect(404)
    })
  })
})
