import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { randomUUID } from 'node:crypto'

import http from 'node:http'

import serverApp from '../../../backend/entrypoints/api/index.mts'

import * as serverRoutes from '@/lib/api/server'

import {
  createTestPost,
  createTestTopic,
  createTestUser,
  insertTestCrawl,
  insertTestCrawler,
  insertTestPost,
  insertTestUrl,
  insertTestUrlHostname,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
} from '../../../backend/test-helpers/index.mts'

import { createHousehold } from '../../../backend/services/individuals-households/index.mts'

import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../routes.mts'

describe('routes — user and admin', () => {
  let backendServer: http.Server

  let previousApiBaseUrl: string | undefined

  let previousPublicApiBaseUrl: string | undefined

  let backendBaseUrl: string

  let adminCookieHeader: Record<string, string>

  let hostnameId: string

  let urlId: string

  let crawlId: string

  let crawlerId: string

  beforeAll(async () => {
    previousApiBaseUrl = process.env.API_BASE_URL
    previousPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

    backendServer = http.createServer(serverApp.callback())
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    process.env.API_BASE_URL = backendBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = backendBaseUrl

    const user = await createTestUser()
    const admin = await createTestUser({ administrator: true })

    await createWebApiTestCookieHeader(user.id)
    adminCookieHeader = await createWebApiTestCookieHeader(admin.id)

    const topic = await createTestTopic({ user: admin })

    await createTestPost({ user })
    await insertTestPost({
      title: 'Web API review queue post',
      slug: `web-api-review-queue-ua-${randomUUID()}`,
      createdById: user.id,
      markdown: 'Review queue fixture for web API helper coverage.',
      clearanceStatus: 'rejected',
    })

    const rssFeedId = await createTestRssFeedWithTiming(topic.id)
    await createTestRssFeedItemWithUrl(rssFeedId)

    await createHousehold(user)
    const hostname = `web-api-ua-${randomUUID()}.example.com`
    hostnameId = await insertTestUrlHostname({
      hostname,
      blocked: false,
      crawlable: true,
    })
    urlId = await insertTestUrl({
      url: `https://${hostname}/path`,
      hostnameId,
    })
    crawlerId = await insertTestCrawler({
      hostnameId,
      description: 'Web API test crawler',
    })
    const crawl = await insertTestCrawl({
      urlId,
      statusCode: 200,
      markdown: 'Web API test crawl markdown',
    })
    crawlId = crawl.id
  }, 15_000)

  afterAll(async () => {
    await new Promise<void>(resolve => {
      backendServer.close(() => resolve())
    })
    if (previousApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL
    } else {
      process.env.API_BASE_URL = previousApiBaseUrl
    }

    if (previousPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = previousPublicApiBaseUrl
    }
  }, 15_000)

  describe('web server API admin routes', () => {
    it('getTopicAliasesSearch resolves', async () => {
      await expect(
        serverRoutes.getTopicAliasesSearch<unknown>(
          { q: 'web-api-test' },
          { headers: adminCookieHeader },
        ),
      ).resolves.not.toThrow()
    })

    it('getHostnames returns a list of hostnames', async () => {
      const result = await serverRoutes.getHostnames({ headers: adminCookieHeader })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getHostname resolves the created hostname', async () => {
      const result = await serverRoutes.getHostname(hostnameId, { headers: adminCookieHeader })
      expect(result).not.toBeNull()
      expect(result?.hostname.id).toBe(hostnameId)
    })

    it('getUrls returns a list of urls', async () => {
      const result = await serverRoutes.getUrls({ headers: adminCookieHeader })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getUrl resolves the created url', async () => {
      const result = await serverRoutes.getUrl(urlId, { headers: adminCookieHeader })
      expect(result).not.toBeNull()
      expect(result?.url.id).toBe(urlId)
    })

    it('getUrlCrawls returns a list of crawls', async () => {
      const result = await serverRoutes.getUrlCrawls(urlId, { headers: adminCookieHeader })
      expect(Array.isArray(result.results)).toBe(true)
    })

    it('getUrlCrawl resolves the created crawl', async () => {
      const result = await serverRoutes.getUrlCrawl(urlId, crawlId, {
        headers: adminCookieHeader,
      })
      expect(result).not.toBeNull()
      expect(result?.crawl.id).toBe(crawlId)
    })

    it('getCrawler resolves the created crawler', async () => {
      const result = await serverRoutes.getCrawler<unknown>(crawlerId, {
        headers: adminCookieHeader,
      })
      expect(result).not.toBeNull()
    })

    it('getAdminReviewQueue returns a paginated result', async () => {
      const result = await serverRoutes.getAdminReviewQueue({
        headers: adminCookieHeader,
        limit: 1,
      })
      expect(Array.isArray(result.results)).toBe(true)
      expect(result.page_info).toBeDefined()
    })
  })
})
