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
  const populatedCrawlUpdate = {
    request_headers: { 'user-agent': 'test-bot' },
    response_headers: { 'content-type': 'text/html' },
    html_sha256: Buffer.alloc(32, 1),
    html_snapshot_uploaded_at: new Date('2026-01-01T00:00:00.000Z'),
    links: { a: ['/alpha'] },
    meta_tags: {
      'og:title': 'Populated crawl',
    },
  }
  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    freeUser = await createTestUser()
    plusUser = await createTestUser()
    proUser = await createTestUser()

    await createTestMembership({ user_id: plusUser.id, plan: 'plus' })
    await createTestMembership({ user_id: proUser.id, plan: 'pro' })
  }, 60_000)
  describe('URLs Routes', () => {
    describe('POST /api/v1/urls/:id/crawl', () => {
      it('should enqueue crawl for admin users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `crawl-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://crawl-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request.post(`/api/v1/urls/${urlId}/crawl`).expect(200)

        expect(response.body.success).toBe(true)
        expect(response.body.message).toBe('Crawl enqueued')
      })

      it('should return 403 for free users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `no-crawl-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://no-crawl-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(freeUser)

        await request.post(`/api/v1/urls/${urlId}/crawl`).expect(403)
      })
    })
    describe('GET /api/v1/urls/:id/crawls', () => {
      it('should return crawls for a URL for admin users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `crawls-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://crawls-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request.get(`/api/v1/urls/${urlId}/crawls`).expect(200)

        expect(response.body.results).toBeDefined()
        expect(Array.isArray(response.body.results)).toBe(true)
        expect(response.body.page_info).toBeDefined()
      })

      it('should return crawls for pro users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `pro-crawls-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://pro-crawls-${random}.example.com/page`,
          hostnameId,
        })
        const { id: crawlId } = await insertTestCrawl({
          urlId,
          statusCode: 200,
          markdown: 'Pro crawls content',
        })
        await updateCrawl(crawlId, urlId, populatedCrawlUpdate)
        const request = createRequest()
        await request.authenticateAs(proUser)

        const response = await request.get(`/api/v1/urls/${urlId}/crawls`).expect(200)

        expect(Array.isArray(response.body.results)).toBe(true)
        expect(response.body.results.length).toBeGreaterThan(0)
        const crawl = response.body.results.find((result: { id: string }) => result.id === crawlId)
        expect(crawl).toBeDefined()
        expect(crawl).not.toHaveProperty('request_headers')
        expect(crawl).not.toHaveProperty('response_headers')
        expect(crawl).not.toHaveProperty('html_sha256')
        expect(crawl).not.toHaveProperty('html_snapshot_uploaded_at')
        expect(crawl).not.toHaveProperty('markdown')
        expect(crawl).not.toHaveProperty('links')
        expect(crawl).not.toHaveProperty('meta_tags')
        expect(crawl).not.toHaveProperty('etag')
        expect(crawl).not.toHaveProperty('crawler_id')
      })

      it('should return 403 for free users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `no-view-crawls-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://no-view-crawls-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(freeUser)

        await request.get(`/api/v1/urls/${urlId}/crawls`).expect(403)
      })

      it('should return 200 for plus users (plus is the new base paid tier with crawl history access)', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `plus-crawls-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://plus-crawls-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()
        await request.authenticateAs(plusUser)

        await request.get(`/api/v1/urls/${urlId}/crawls`).expect(200)
      })

      it('should return 401 for unauthenticated users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `anon-crawls-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://anon-crawls-${random}.example.com/page`,
          hostnameId,
        })
        const request = createRequest()

        await request.get(`/api/v1/urls/${urlId}/crawls`).expect(401)
      })
    })

    describe('GET /api/v1/urls/:id/crawls/:crawlId', () => {
      it('should return specific crawl for admin users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `crawl-detail-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://crawl-detail-${random}.example.com/page`,
          hostnameId,
        })
        const { id: crawlId } = await insertTestCrawl({
          urlId,
          statusCode: 200,
          markdown: 'Test content',
        })
        await updateCrawl(crawlId, urlId, {
          ...populatedCrawlUpdate,
          meta_tags: {
            'og:title': 'Test content',
          },
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request.get(`/api/v1/urls/${urlId}/crawls/${crawlId}`).expect(200)

        expect(response.body.crawl).toBeDefined()
        expect(response.body.crawl.id).toBe(crawlId)
        expect(response.body.crawl.url_id).toBe(urlId)
        expect(response.body.crawl.request_headers).toEqual({ 'user-agent': 'test-bot' })
        expect(response.body.crawl.response_headers).toEqual({ 'content-type': 'text/html' })
        expect(response.body.crawl.html_sha256).toBeDefined()
        expect(response.body.crawl.html_snapshot_uploaded_at).toBeDefined()
        expect(response.body.crawl.markdown).toBe('Test content')
        expect(response.body.crawl.links).toEqual({ a: ['/alpha'] })
        expect(response.body.crawl.meta_tags).toEqual({ 'og:title': 'Test content' })
      }, 60_000)

      it('should return specific crawl for pro users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `pro-crawl-detail-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://pro-crawl-detail-${random}.example.com/page`,
          hostnameId,
        })
        const { id: crawlId } = await insertTestCrawl({
          urlId,
          statusCode: 200,
          markdown: 'Premium test content',
        })
        await updateCrawl(crawlId, urlId, {
          ...populatedCrawlUpdate,
          meta_tags: {
            'og:title': 'Premium test content',
          },
        })
        const request = createRequest()
        await request.authenticateAs(proUser)

        const response = await request.get(`/api/v1/urls/${urlId}/crawls/${crawlId}`).expect(200)

        expect(response.body.crawl).toBeDefined()
        expect(response.body.crawl).not.toHaveProperty('markdown')
        expect(response.body.crawl).not.toHaveProperty('links')
        expect(response.body.crawl).not.toHaveProperty('meta_tags')
        expect(response.body.crawl).not.toHaveProperty('request_headers')
        expect(response.body.crawl).not.toHaveProperty('response_headers')
        expect(response.body.crawl).not.toHaveProperty('html_sha256')
        expect(response.body.crawl).not.toHaveProperty('html_snapshot_uploaded_at')
        expect(response.body).not.toHaveProperty('og_image_sideload')
      }, 60_000)

      it('should return 403 for free users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `no-crawl-detail-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://no-crawl-detail-${random}.example.com/page`,
          hostnameId,
        })
        const { id: crawlId } = await insertTestCrawl({
          urlId,
          statusCode: 200,
          markdown: 'Test content',
        })
        const request = createRequest()
        await request.authenticateAs(freeUser)

        await request.get(`/api/v1/urls/${urlId}/crawls/${crawlId}`).expect(403)
      }, 60_000)

      it('should return 401 for unauthenticated users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `anon-crawl-detail-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://anon-crawl-detail-${random}.example.com/page`,
          hostnameId,
        })
        const { id: crawlId } = await insertTestCrawl({
          urlId,
          statusCode: 200,
          markdown: 'Test content',
        })
        const request = createRequest()

        await request.get(`/api/v1/urls/${urlId}/crawls/${crawlId}`).expect(401)
      }, 60_000)
    })
  })
})
