import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestTopic,
  insertTestRssFeed,
  createTestUser,
  createTestMembership,
} from '@voucha/test-helpers'

import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

import type { PrivateUser } from '@services/users/types'

describe('index', () => {
  describe('RSS Feeds Routes', () => {
    let user: PrivateUser

    beforeAll(async () => {
      user = await createTestUser()
    })

    describe('GET /api/v1/rss-feeds/:id — latest_crawl membership gating', () => {
      it('should not include latest_crawl for anon users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Anon Feed Topic ${random}`,
          slug: `anon-feed-topic-${random}`,
          createdById: user.id,
        })
        const feedId = await insertTestRssFeed({ topicId, title: `Anon Feed ${random}` })
        const request = createRequest()
        const response = await request.get(`/api/v1/rss-feeds/${feedId}`).expect(200)
        expect(response.body.can_view_latest_crawl).toBe(false)
        expect(response.body.latest_crawl).toBeNull()
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['vary']).toContain('Cookie')
        expect(response.headers['vary']).toContain('Authorization')
      })

      it('should not include latest_crawl for free users', async () => {
        const freeUser = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Free Feed Topic ${random}`,
          slug: `free-feed-topic-${random}`,
          createdById: user.id,
        })
        const feedId = await insertTestRssFeed({ topicId, title: `Free Feed ${random}` })
        const request = createRequest()
        await request.authenticateAs(freeUser!)
        const response = await request.get(`/api/v1/rss-feeds/${feedId}`).expect(200)
        expect(response.body.can_view_latest_crawl).toBe(false)
        expect(response.body.latest_crawl).toBeNull()
      })

      it('should include latest_crawl flag for plus users', async () => {
        const plusUser = await createTestUser()
        await createTestMembership({ user_id: plusUser!.id, plan: 'plus' })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Plus Feed Topic ${random}`,
          slug: `plus-feed-topic-${random}`,
          createdById: user.id,
        })
        const feedId = await insertTestRssFeed({ topicId, title: `Plus Feed ${random}` })
        const request = createRequest()
        await request.authenticateAs(plusUser!)
        const response = await request.get(`/api/v1/rss-feeds/${feedId}`).expect(200)
        expect(response.body.can_view_latest_crawl).toBe(true)
      })

      it('should include latest_crawl flag for admins', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Admin Latest Crawl Topic ${random}`,
          slug: `admin-latest-crawl-topic-${random}`,
          createdById: admin!.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Admin Latest Crawl Feed ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)
        const response = await request.get(`/api/v1/rss-feeds/${feedId}`).expect(200)
        expect(response.body.can_view_latest_crawl).toBe(true)
      })
    })

    describe('GET/PATCH/DELETE /api/v1/rss-feeds/:id', () => {
      it('should get, update, and delete a feed as admin', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Detail Topic ${random}`,
          slug: `detail-topic-${random}`,
          createdById: admin!.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Detail Feed ${random}`,
        })
        const request = createRequest()

        const getResponse = await request.get(`/api/v1/rss-feeds/${feedId}`).expect(200)
        expect(getResponse.body.rss_feed.id).toBe(feedId)
        expect(getResponse.headers['cache-control']).toContain('public')
        expect(getResponse.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
        )
        expect(getResponse.headers['vary']).toContain('Cookie')
        expect(getResponse.headers['vary']).toContain('Authorization')

        await request.authenticateAs(admin!)

        const patchResponse = await request
          .patch(`/api/v1/rss-feeds/${feedId}`)
          .send({ title: `Updated Feed ${random}` })
          .expect(200)
        expect(patchResponse.body.rss_feed.title).toBe(`Updated Feed ${random}`)

        await request.delete(`/api/v1/rss-feeds/${feedId}`).expect(204)

        await request.get(`/api/v1/rss-feeds/${feedId}`).expect(404)
      })

      it('should update enablement and discoverability state as admin', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `State Patch Topic ${random}`,
          slug: `state-patch-topic-${random}`,
          createdById: admin!.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `State Patch Feed ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        const patchResponse = await request
          .patch(`/api/v1/rss-feeds/${feedId}`)
          .send({ enabled: false, discoverable: false, reason: 'test state update' })
          .expect(200)

        expect(patchResponse.body.rss_feed.is_enabled).toBe(false)
        expect(patchResponse.body.rss_feed.is_discoverable).toBe(false)
      })

      it('should reject unknown patch fields', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Strict Patch Topic ${random}`,
          slug: `strict-patch-topic-${random}`,
          createdById: admin!.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Strict Patch Feed ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        await request
          .patch(`/api/v1/rss-feeds/${feedId}`)
          .send({ home_page_url: `https://example.com/patch-${random}` })
          .expect(400)
      })

      it('should reject reason-only state patch payloads', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Reason Patch Topic ${random}`,
          slug: `reason-patch-topic-${random}`,
          createdById: admin!.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Reason Patch Feed ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        await request
          .patch(`/api/v1/rss-feeds/${feedId}`)
          .send({ reason: 'missing state' })
          .expect(400)
      })
    })
  })
})
