import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
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
    describe('GET /api/v1/hostnames', () => {
      it('should return hostnames for admin users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `test-${random}.example.com`,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request.get(`/api/v1/hostnames?query=test-${random}`).expect(200)

        expect(Array.isArray(response.body.results)).toBe(true)
        expect(response.body.results.find((h: { id: string }) => h.id === hostnameId)).toBeDefined()
        const hostname = response.body.hostnames[hostnameId]
        expect(hostname).toBeDefined()
        expect(hostname.votes_score_net).toBeUndefined()
        expect(hostname.votes_count_up).toBeUndefined()
        expect(hostname.votes_count_down).toBeUndefined()
        expect(response.body.hostname_elections[hostnameId]).toBeDefined()
      })

      it('should return 200 for non-admin users without moderation fields', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `nonadmin-${random}.example.com`,
        })
        const request = createRequest()
        await request.authenticateAs(regularUser)

        const response = await request.get(`/api/v1/hostnames?query=nonadmin-${random}`).expect(200)

        expect(Array.isArray(response.body.results)).toBe(true)
        const hostnameRef = response.body.results.find((h: { id: string }) => h.id === hostnameId)
        expect(hostnameRef).toBeDefined()
        const hostname = response.body.hostnames[hostnameId]
        expect(hostname).toBeDefined()
        expect(hostname.blocked).toBeUndefined()
        expect(hostname.crawlable).toBeUndefined()
        expect(hostname.link_rel_follow).toBeUndefined()
        expect(hostname.votes_score_net).toBeUndefined()
        expect(hostname.votes_count_up).toBeUndefined()
        expect(hostname.votes_count_down).toBeUndefined()
      })

      it('returns hostnames for unauthenticated users with cache-control header', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `anon-list-${random}.example.com`,
        })
        const request = createRequest()

        const response = await request
          .get(`/api/v1/hostnames?query=anon-list-${random}`)
          .expect(200)

        expect(Array.isArray(response.body.results)).toBe(true)
        const hostnameRef = response.body.results.find((h: { id: string }) => h.id === hostnameId)
        expect(hostnameRef).toBeDefined()
        const hostname = response.body.hostnames[hostnameId]
        expect(hostname).toBeDefined()
        expect(hostname.blocked).toBeUndefined()
        expect(hostname.crawlable).toBeUndefined()
        expect(hostname.link_rel_follow).toBeUndefined()
        expect(hostname.votes_score_net).toBeUndefined()
        expect(hostname.votes_count_up).toBeUndefined()
        expect(hostname.votes_count_down).toBeUndefined()
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
        )
      })

      it('returns public topic, election, and top URL payloads for hostname browse pages', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Hostname Browse Topic ${random}`,
          slug: `hostname-browse-topic-${random}`,
          createdById: admin.id,
        })
        await insertTestRssFeed({
          topicId,
          title: `Hostname Browse Feed ${random}`,
          homePageUrl: `https://browse-${random}.example.com/home`,
          rssFeedUrl: `https://browse-${random}.example.com/feed.xml`,
        })
        const request = createRequest()
        const response = await request
          .get(`/api/v1/hostnames?query=browse-${random}.example.com`)
          .expect(200)

        const hostnameEntry = Object.values(
          response.body.hostnames as Record<string, { id: string; hostname: string }>,
        ).find(item => item.hostname === `browse-${random}.example.com`)

        expect(hostnameEntry).toBeDefined()
        expect(response.body.top_urls_by_hostname_id?.[hostnameEntry!.id]?.length).toBeGreaterThan(
          0,
        )
        expect(response.body.topics?.[topicId]?.id).toBe(topicId)
      })

      it('does not set public cache-control for authenticated users', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request.get('/api/v1/hostnames').expect(200)

        expect(response.headers['cache-control']).toBeUndefined()
      })

      it('should support query filter', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        await insertTestUrlHostname({
          hostname: `unique-${random}.example.com`,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request.get(`/api/v1/hostnames?query=unique-${random}`).expect(200)

        expect(response.body.results.length).toBeGreaterThan(0)
        const firstRef = response.body.results[0]
        expect(response.body.hostnames[firstRef.id]?.hostname).toContain(`unique-${random}`)
      })

      it('should support blocked filter', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const hostnameId = await insertTestUrlHostname({
          hostname: `blocked-${random}.example.com`,
          blocked: true,
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request
          .get(`/api/v1/hostnames?blocked=true&query=blocked-${random}`)
          .expect(200)

        expect(response.body.results.some((h: { id: string }) => h.id === hostnameId)).toBe(true)
      })

      it('returns paginated results with page_info cursor when more results exist', async () => {
        const prefix = Math.random().toString(36).slice(2, 8)
        // Insert 3 hostnames so we can test pagination with limit=2
        const ids = await Promise.all([
          insertTestUrlHostname({ hostname: `page-a-${prefix}.example.com` }),
          insertTestUrlHostname({ hostname: `page-b-${prefix}.example.com` }),
          insertTestUrlHostname({ hostname: `page-c-${prefix}.example.com` }),
        ])
        const request = createRequest()

        const response = await request.get(`/api/v1/hostnames?query=${prefix}&limit=2`).expect(200)

        expect(Array.isArray(response.body.results)).toBe(true)
        expect(response.body.page_info.has_next_page).toBe(true)
        expect(response.body.page_info.end_cursor).toBeTypeOf('string')

        // Fetch next page
        const page2 = await request
          .get(
            `/api/v1/hostnames?query=${prefix}&limit=2&after=${response.body.page_info.end_cursor}`,
          )
          .expect(200)

        expect(Array.isArray(page2.body.results)).toBe(true)
        expect(page2.body.results.length).toBe(1)
        expect(page2.body.page_info.has_next_page).toBe(false)

        // Verify all 3 IDs appear across both pages
        const allIds = [...response.body.results, ...page2.body.results].map(
          (r: { id: string }) => r.id,
        )
        for (const id of ids) {
          expect(allIds).toContain(id)
        }
      })

      describe('anon limit clamping', () => {
        const random = Math.random().toString(36).slice(2, 8)

        beforeAll(async () => {
          for (let i = 0; i < 30; i++) {
            await insertTestUrlHostname({
              hostname: `anon-limit-${random}-${i}.example.com`,
            })
          }
        })

        it('unauthenticated request with limit=100 returns at most 25 results', async () => {
          const request = createRequest()
          const response = await request
            .get(`/api/v1/hostnames?query=anon-limit-${random}&limit=100`)
            .expect(200)
          expect(response.body.results.length).toBeLessThanOrEqual(25)
        })

        it('authenticated request with limit=100 can return up to 100 results', async () => {
          const request = createRequest()
          await request.authenticateAs(admin)
          const response = await request
            .get(`/api/v1/hostnames?query=anon-limit-${random}&limit=100`)
            .expect(200)
          // All 30 hostnames returned for authenticated users — not clamped
          expect(response.body.results.length).toBeGreaterThan(25)
          expect(response.body.results.length).toBeLessThanOrEqual(100)
        })
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestCrawler)
  void (0 as unknown as typeof createDeviceAndSessionTokens)
  void (0 as unknown as typeof HTTP_CACHE_LONG_MAX_AGE_SECONDS)
  void (0 as unknown as typeof v7)
})
