import { describe, it, expect, beforeEach } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { rss_feeds } from '@queues/rss-feeds/queues'
import {
  insertTestTopic,
  insertTestRssFeed,
  insertTestRssFeedCrawl,
  createTestUser,
  createTestMembership,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'

describe('index', () => {
  describe('RSS Feeds Routes', () => {
    beforeEach(async () => {
      await rss_feeds.obliterate({ force: true })
    })

    describe('POST /api/v1/rss-feeds/:id/refreshes', () => {
      it('returns 403 for paid users', async () => {
        const paidUser = await createTestUser()
        await createTestMembership({ user_id: paidUser.id, plan: 'pro', status: 'active' })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Paid Refresh Topic ${random}`,
          slug: `paid-refresh-${random}`,
          createdById: paidUser.id,
        })
        const feedId = await insertTestRssFeed({ topicId, title: `Paid Refresh Feed ${random}` })
        const request = createRequest()
        await request.authenticateAs(paidUser)

        await request.post(`/api/v1/rss-feeds/${feedId}/refreshes`).expect(403)
      })

      it('enqueues a refresh job for admin users without fetching synchronously', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Refresh Feed Topic ${random}`,
          slug: `refresh-feed-${random}`,
          createdById: admin!.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Refresh Feed ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        const response = await request.post(`/api/v1/rss-feeds/${feedId}/refreshes`).expect(200)

        expect(response.body).toEqual({
          success: true,
          message: 'RSS feed refresh enqueued',
          rss_feed_id: feedId,
          force: false,
        })
        const jobs = await rss_feeds.getJobs('waiting')
        expect(jobs).toHaveLength(1)
        expect(jobs[0]?.name).toBe('fetchRssFeed')
        expect(jobs[0]?.data).toMatchObject({ rssFeedId: feedId, ttl: 60_000 })
      })

      it('enqueues forced refreshes with ttl 0', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Force Refresh Feed Topic ${random}`,
          slug: `force-refresh-feed-${random}`,
          createdById: admin!.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Force Refresh Feed ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        const response = await request
          .post(`/api/v1/rss-feeds/${feedId}/refreshes?force=true`)
          .expect(200)

        expect(response.body.force).toBe(true)
        const jobs = await rss_feeds.getJobs('waiting')
        expect(jobs).toHaveLength(1)
        expect(jobs[0]?.data).toMatchObject({ rssFeedId: feedId, ttl: 0 })
      })
    })

    describe('GET /api/v1/rss-feeds/:id/crawls/:crawlId', () => {
      it('should return 401 for unauthenticated requests', async () => {
        await createRequest()
          .get(
            '/api/v1/rss-feeds/00000000-0000-0000-0000-000000000000/crawls/00000000-0000-0000-0000-000000000001',
          )
          .expect(401)
      })

      it.each([
        ['free', null],
        ['paused', 'paused'],
        ['cancelled', 'cancelled'],
        ['expired', 'expired'],
      ])('returns 403 for %s users', async (_, status) => {
        const lifecycleUser = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Crawl Detail NonAdmin Topic ${random}`,
          slug: `crawl-detail-nonadmin-${random}`,
          createdById: lifecycleUser.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Crawl Detail NonAdmin Feed ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(lifecycleUser)
        if (status)
          await createTestMembership({
            user_id: lifecycleUser.id,
            plan: 'plus',
            status: status as never,
          })
        await request
          .get(`/api/v1/rss-feeds/${feedId}/crawls/00000000-0000-0000-0000-000000000001`)
          .expect(403)
      })

      it('returns 403 after a finite paid grant expires', async () => {
        const elapsedUser = await createTestUser()
        const membership = await createTestMembership({ user_id: elapsedUser.id, plan: 'plus' })
        await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 1_000))
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Elapsed Crawl Detail Topic ${random}`,
          slug: `elapsed-crawl-detail-${random}`,
          createdById: elapsedUser.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Elapsed Crawl Detail Feed ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(elapsedUser)

        await request
          .get(`/api/v1/rss-feeds/${feedId}/crawls/00000000-0000-0000-0000-000000000001`)
          .expect(403)
      })

      it.each([
        ['plus', 'active'],
        ['plus', 'past_due'],
        ['pro', 'active'],
        ['pro', 'past_due'],
      ])('returns a redacted detail for %s %s users', async (plan, status) => {
        const paidUser = await createTestUser()
        await createTestMembership({
          user_id: paidUser.id,
          plan: plan as never,
          status: status as never,
        })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Paid Crawl Detail Topic ${random}`,
          slug: `paid-crawl-detail-${random}`,
          createdById: paidUser.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Paid Crawl Detail Feed ${random}`,
        })
        const crawlId = await insertTestRssFeedCrawl({
          rssFeedId: feedId,
          responseCode: 200,
        })
        const request = createRequest()
        await request.authenticateAs(paidUser)
        const response = await request
          .get(`/api/v1/rss-feeds/${feedId}/crawls/${crawlId}`)
          .expect(200)

        expect(response.body.crawl).toEqual({
          id: crawlId,
          response_code: 200,
          created_at: expect.any(String),
        })
      })

      it('should return 404 for unknown feed id', async () => {
        const admin = await createTestUser({ administrator: true })
        const request = createRequest()
        await request.authenticateAs(admin!)
        await request
          .get(
            '/api/v1/rss-feeds/00000000-0000-0000-0000-000000000000/crawls/00000000-0000-0000-0000-000000000001',
          )
          .expect(404)
      })

      it('should return 404 for unknown crawl id', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Crawl Detail Admin Topic ${random}`,
          slug: `crawl-detail-admin-${random}`,
          createdById: admin!.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Crawl Detail Admin Feed ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)
        await request
          .get(`/api/v1/rss-feeds/${feedId}/crawls/00000000-0000-0000-0000-000000000001`)
          .expect(404)
      })

      it('should return crawl detail for admin', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Crawl Detail Found Topic ${random}`,
          slug: `crawl-detail-found-${random}`,
          createdById: admin!.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Crawl Detail Found Feed ${random}`,
        })
        const crawlId = await insertTestRssFeedCrawl({ rssFeedId: feedId, responseCode: 200 })

        const request = createRequest()
        await request.authenticateAs(admin!)
        const response = await request
          .get(`/api/v1/rss-feeds/${feedId}/crawls/${crawlId}`)
          .expect(200)

        expect(response.body.crawl).toBeDefined()
        expect(response.body.crawl.id).toBe(crawlId)
        expect(response.body.crawl.response_code).toBe(200)
      })
    })
  })
})
