import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestUrlHostname,
  insertTestCrawler,
  insertTestTopic,
  insertTestRssFeed,
} from '@voucha/test-helpers'

import { createDeviceAndSessionTokens } from '@services/jwt-session'

import type { PrivateUser } from '@services/users/types'

import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS, HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

import { v7 } from 'uuid'

describe('index', () => {
  let admin: PrivateUser

  let regularUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser({ administrator: false })
  })

  describe('Hostnames Routes', () => {
    describe('GET /api/v1/hostnames/:id', () => {
      it('should return hostname with crawlers for admin users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `detail-${random}.example.com`,
        })
        const crawlerId = await insertTestCrawler({
          hostnameId,
          description: `Test crawler ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request.get(`/api/v1/hostnames/${hostnameId}`).expect(200)

        expect(response.body.hostname).toBeDefined()
        expect(response.body.hostname.id).toBe(hostnameId)
        expect(response.body.hostname.votes_score_net).toBeUndefined()
        expect(response.body.hostname.votes_count_up).toBeUndefined()
        expect(response.body.hostname.votes_count_down).toBeUndefined()
        expect(Array.isArray(response.body.crawlers)).toBe(true)
        expect(response.body.crawlers.length).toBeGreaterThan(0)
        expect(response.body.crawlers[0].id).toBe(crawlerId)
      })

      it('should return 200 for non-admin users without moderation fields or crawlers', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `forbidden-${random}.example.com`,
        })
        const request = createRequest()
        await request.authenticateAs(regularUser)

        const response = await request.get(`/api/v1/hostnames/${hostnameId}`).expect(200)

        expect(response.body.hostname).toBeDefined()
        expect(response.body.hostname.id).toBe(hostnameId)
        expect(response.body.hostname.blocked).toBeUndefined()
        expect(response.body.hostname.crawlable).toBeUndefined()
        expect(response.body.hostname.link_rel_follow).toBeUndefined()
        expect(response.body.hostname.votes_score_net).toBeUndefined()
        expect(response.body.hostname.votes_count_up).toBeUndefined()
        expect(response.body.hostname.votes_count_down).toBeUndefined()
        expect(response.body.crawlers).toBeUndefined()
      })

      it('returns hostname detail for unauthenticated users with cache-control header', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `anon-detail-${random}.example.com`,
        })
        const request = createRequest()

        const response = await request.get(`/api/v1/hostnames/${hostnameId}`).expect(200)

        expect(response.body.hostname).toBeDefined()
        expect(response.body.hostname.id).toBe(hostnameId)
        expect(response.body.hostname.blocked).toBeUndefined()
        expect(response.body.hostname.crawlable).toBeUndefined()
        expect(response.body.hostname.link_rel_follow).toBeUndefined()
        expect(response.body.hostname.votes_score_net).toBeUndefined()
        expect(response.body.hostname.votes_count_up).toBeUndefined()
        expect(response.body.hostname.votes_count_down).toBeUndefined()
        expect(response.body.crawlers).toBeUndefined()
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
        )
        expect(response.headers['vary']).toContain('Cookie')
        expect(response.headers['vary']).toContain('Authorization')
      })

      it('returns linked topic, feed list, election data, and top URLs for public hostname detail', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Hostname Detail Topic ${random}`,
          slug: `hostname-detail-topic-${random}`,
          createdById: admin.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Hostname Detail Feed ${random}`,
          homePageUrl: `https://detail-${random}.example.com/home`,
          rssFeedUrl: `https://detail-${random}.example.com/feed.xml`,
        })
        const request = createRequest()
        const response = await request
          .get(`/api/v1/hostnames/detail-${random}.example.com`)
          .expect(200)

        expect(response.body.topic?.id).toBe(topicId)
        expect(response.body.hostname?.hostname).toBe(`detail-${random}.example.com`)
        expect(response.body.top_urls.length).toBeGreaterThan(0)
        expect(response.body.rss_feeds.some((feed: { id: string }) => feed.id === feedId)).toBe(
          true,
        )
      })

      it('should return 404 for non-existent hostname', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)

        await request.get('/api/v1/hostnames/00000000-0000-0000-0000-000000000000').expect(404)
      })

      it('should hide blocked hostnames from non-admin users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `blocked-detail-${random}.example.com`,
          blocked: true,
        })
        const request = createRequest()
        await request.authenticateAs(regularUser)

        await request.get(`/api/v1/hostnames/${hostnameId}`).expect(404)
      })

      it('should hide blocked hostnames from unauthenticated users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `blocked-anon-detail-${random}.example.com`,
          blocked: true,
        })
        const request = createRequest()

        await request.get(`/api/v1/hostnames/${hostnameId}`).expect(404)
      })

      it('should hide blocked hostnames from anonymous sessions', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `blocked-session-detail-${random}.example.com`,
          blocked: true,
        })
        const request = createRequest()
        const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
          did: v7(),
          sid: v7(),
        })

        await request
          .get(`/api/v1/hostnames/${hostnameId}`)
          .set('Cookie', [`dt=${deviceToken.token}`, `st=${sessionToken.token}`])
          .expect(404)
      })
    })

    describe('PATCH /api/v1/hostnames/:id', () => {
      it('allows admins to update the Web Risk skip flag', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `skip-web-risk-${random}.example.com`,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        await request
          .patch(`/api/v1/hostnames/${hostnameId}`)
          .send({ skip_web_risk: true })
          .expect(204)

        const response = await request.get(`/api/v1/hostnames/${hostnameId}`).expect(200)
        expect(response.body.hostname.skip_web_risk).toBe(true)
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof HTTP_CACHE_SHORT_MAX_AGE_SECONDS)
})
