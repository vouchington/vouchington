import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestUrl,
  insertTestUrlHostname,
  insertTestCrawl,
  createTestMembership,
} from '@voucha/test-helpers'
import { updateCrawl } from '@services/crawls'
import type { PrivateUser } from '@services/users/types'

describe('index', () => {
  let admin: PrivateUser
  let freeUser: PrivateUser
  let plusUser: PrivateUser
  let proUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    freeUser = await createTestUser()
    plusUser = await createTestUser()
    proUser = await createTestUser()

    await createTestMembership({ user_id: plusUser.id, plan: 'plus' })
    await createTestMembership({ user_id: proUser.id, plan: 'pro' })
  }, 60_000)

  describe('URLs Routes', () => {
    describe('GET /api/v1/urls', () => {
      it('should return URLs for admin users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `urls-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://urls-${random}.example.com/test`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request.get(`/api/v1/urls?hostnameId=${hostnameId}`).expect(200)

        expect(response.body.results).toBeDefined()
        expect(Array.isArray(response.body.results)).toBe(true)
        expect(response.body.page_info).toBeDefined()
        expect(response.body.results.find((u: { id: string }) => u.id === urlId)).toBeDefined()
      })

      it('should return 200 for free users without hostname moderation fields', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `nonadmin-list-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://nonadmin-list-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(freeUser)

        const response = await request.get(`/api/v1/urls?query=nonadmin-list-${random}`).expect(200)

        expect(Array.isArray(response.body.results)).toBe(true)
        const url = response.body.results.find((u: { id: string }) => u.id === urlId)
        expect(url).toBeDefined()
        expect(url.hostname.blocked).toBeUndefined()
        expect(url.hostname.crawlable).toBeUndefined()
        expect(url.hostname.link_rel_follow).toBeUndefined()
        expect(url.hostname.votes_score_net).toBeUndefined()
        expect(url.hostname.votes_count_up).toBeUndefined()
        expect(url.hostname.votes_count_down).toBeUndefined()
      })

      it('returns 401 for unauthenticated users', async () => {
        const request = createRequest()
        await request.get('/api/v1/urls').expect(401)
      })

      it('should support query filter', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `search-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://search-${random}.example.com/unique-path`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request.get(`/api/v1/urls?query=unique-path`).expect(200)

        expect(response.body.results.some((u: { id: string }) => u.id === urlId)).toBe(true)
      })

      it('should support hostnameId filter', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `filter-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://filter-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request.get(`/api/v1/urls?hostnameId=${hostnameId}`).expect(200)

        expect(response.body.results.every((u: { id: string }) => u.id === urlId)).toBe(true)
      })

      it('should support pagination with cursor', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)

        const firstResponse = await request.get('/api/v1/urls?limit=1').expect(200)

        expect(firstResponse.body.results.length).toBeLessThanOrEqual(1)
        expect(firstResponse.body.page_info).toBeDefined()

        expect(firstResponse.body.page_info.has_next_page).toBe(true)
        const cursor = firstResponse.body.page_info.end_cursor
        const secondResponse = await request.get(`/api/v1/urls?limit=1&after=${cursor}`).expect(200)

        expect(secondResponse.body.results.length).toBeLessThanOrEqual(1)
        expect(firstResponse.body.results.length).toBeGreaterThan(0)
        expect(secondResponse.body.results.length).toBeGreaterThan(0)
        expect(secondResponse.body.results[0].id).not.toBe(firstResponse.body.results[0].id)
      })
    })

    describe('GET /api/v1/urls/:id', () => {
      it('should return URL with capability flags for admin users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `detail-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://detail-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request.get(`/api/v1/urls/${urlId}`).expect(200)

        expect(response.body.url).toBeDefined()
        expect(response.body.url.id).toBe(urlId)
        expect(response.body.url.hostname.votes_score_net).toBeUndefined()
        expect(response.body.url.hostname.votes_count_up).toBeUndefined()
        expect(response.body.url.hostname.votes_count_down).toBeUndefined()
        expect(response.body).toHaveProperty('latest_crawl')
        expect(response.body.can_view_latest_crawl).toBe(true)
        expect(response.body.can_view_crawl_history).toBe(true)
        expect(response.body.can_trigger_crawl).toBe(true)
      })

      it('should return URL for free users with limited access flags', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `free-detail-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://free-detail-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(freeUser)

        const response = await request.get(`/api/v1/urls/${urlId}`).expect(200)

        expect(response.body.url).toBeDefined()
        expect(response.body.url.id).toBe(urlId)
        expect(response.body.url.hostname.votes_score_net).toBeUndefined()
        expect(response.body.url.hostname.votes_count_up).toBeUndefined()
        expect(response.body.url.hostname.votes_count_down).toBeUndefined()
        expect(response.body.latest_crawl).toBeNull()
        expect(response.body.can_view_latest_crawl).toBe(false)
        expect(response.body.can_view_crawl_history).toBe(false)
        expect(response.body.can_trigger_crawl).toBe(false)
      })

      it('should return latest_crawl for plus users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `plus-detail-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://plus-detail-${random}.example.com/page`,
          hostnameId,
        })
        const { id: crawlId } = await insertTestCrawl({
          urlId,
          statusCode: 200,
          markdown: 'Plus test content',
        })
        await updateCrawl(crawlId, urlId, {
          request_headers: { 'user-agent': 'test-bot' },
          response_headers: { 'content-type': 'text/html' },
          html_sha256: Buffer.alloc(32, 1),
          html_snapshot_uploaded_at: new Date('2026-01-01T00:00:00.000Z'),
          links: { a: ['/alpha'] },
          meta_tags: {
            'og:title': 'Plus test content',
          },
        })
        const request = createRequest()
        await request.authenticateAs(plusUser)

        const response = await request.get(`/api/v1/urls/${urlId}`).expect(200)

        expect(response.body.can_view_latest_crawl).toBe(true)
        // Plus is the new $5 tier (equivalent to old Premium), so crawl history is included
        expect(response.body.can_view_crawl_history).toBe(true)
        expect(response.body.can_trigger_crawl).toBe(false)
        expect(response.body.latest_crawl).toBeDefined()
        expect(response.body.latest_crawl).not.toBeNull()
        expect(response.body.latest_crawl).not.toHaveProperty('request_headers')
        expect(response.body.latest_crawl).not.toHaveProperty('response_headers')
        expect(response.body.latest_crawl).not.toHaveProperty('html_sha256')
        expect(response.body.latest_crawl).not.toHaveProperty('html_snapshot_uploaded_at')
        expect(response.body.latest_crawl).not.toHaveProperty('markdown')
        expect(response.body.latest_crawl).not.toHaveProperty('links')
        expect(response.body.latest_crawl).not.toHaveProperty('meta_tags')
      }, 60_000)

      it('should return crawl history access for pro users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `pro-detail-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://pro-detail-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(proUser)

        const response = await request.get(`/api/v1/urls/${urlId}`).expect(200)

        expect(response.body.can_view_latest_crawl).toBe(true)
        expect(response.body.can_view_crawl_history).toBe(true)
        expect(response.body.can_trigger_crawl).toBe(false)
      })

      it('returns 401 for unauthenticated users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `anon-detail-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://anon-detail-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()

        await request.get(`/api/v1/urls/${urlId}`).expect(401)
      })

      it('should return 404 for non-existent URL', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)

        await request.get('/api/v1/urls/00000000-0000-0000-0000-000000000000').expect(404)
      })

      it('should hide URLs on blocked hostnames from free users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `blocked-url-${random}.example.com`,
          blocked: true,
        })
        const urlId = await insertTestUrl({
          url: `https://blocked-url-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(freeUser)

        await request.get(`/api/v1/urls/${urlId}`).expect(404)
      })
    })
  })
})
