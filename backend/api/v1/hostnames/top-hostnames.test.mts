import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestUrlHostname,
  setUrlHostnameVotes,
  createTestTopic,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getUrlHostnameByAny } from '@services/urls-hostnames'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

describe('top-hostnames', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  describe('GET /api/v1/hostnames/top', () => {
    it('returns 200 with results and page_info', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const hostnameId = await insertTestUrlHostname({
        hostname: `top-api-${random}.example.com`,
      })
      await setUrlHostnameVotes(hostnameId, 7, 2)

      const request = createRequest()
      const response = await request.get('/api/v1/hostnames/top').expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.page_info).toBeDefined()
    })

    it('returns cache-control header for anonymous users', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/hostnames/top').expect(200)

      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['cache-control']).toContain(
        `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
      )
    })

    it('does not set cache-control for authenticated users', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/hostnames/top').expect(200)

      expect(response.headers['cache-control']).toBeUndefined()
    })

    it('includes hostnames and hostname_elections in response', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const hostnameId = await insertTestUrlHostname({
        hostname: `top-api-inline-${random}.example.com`,
      })
      await setUrlHostnameVotes(hostnameId, 10, 2)

      // Authenticate to bypass the Valkey search cache so newly-created hostnames are visible
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/hostnames/top?limit=100').expect(200)

      expect(response.body.hostnames).toBeDefined()
      expect(response.body.hostname_elections).toBeDefined()
      expect(response.body.top_urls_by_hostname_id).toBeDefined()

      const hostnameRef = response.body.results.find((r: { id: string }) => r.id === hostnameId)
      expect(hostnameRef).toBeDefined()
      expect(response.body.hostnames[hostnameId].votes_score_net).toBeUndefined()
      expect(response.body.hostnames[hostnameId].votes_count_up).toBeUndefined()
      expect(response.body.hostnames[hostnameId].votes_count_down).toBeUndefined()
      expect(response.body.hostname_elections[hostnameId].votes_score_net).toBe(8)
    })

    it('includes linked topic sidecars for topic-backed hostnames', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const hostname = `top-topic-${random}.example.com`
      const topic = await createTestTopic({ hostname })
      const linkedHostname = await getUrlHostnameByAny(hostname)
      if (!linkedHostname) throw new Error('Expected linked test hostname to exist')
      await setUrlHostnameVotes(linkedHostname.id, 12, 2)

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get(`/api/v1/hostnames/top?topic=${topic.id}&limit=100`)
        .expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(linkedHostname.id)
      expect(response.body.hostnames[linkedHostname.id]?.topic_id).toBe(topic.id)
      expect(response.body.topics[topic.id]?.id).toBe(topic.id)
    })

    it('excludes blocked hostnames', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const blockedId = await insertTestUrlHostname({
        hostname: `top-api-blocked-${random}.example.com`,
        blocked: true,
      })
      await setUrlHostnameVotes(blockedId, 150, 50)

      // Authenticate to bypass the Valkey search cache so the blocked hostname doesn't appear
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/hostnames/top?limit=100').expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).not.toContain(blockedId)
    })

    it('returns 200 with empty results when no top hostnames exist for topic', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      // Use a non-existent topic slug that returns empty
      const request = createRequest()
      const response = await request
        .get(`/api/v1/hostnames/top?topic=nonexistent-topic-${random}`)
        .expect(200)

      expect(response.body.results).toHaveLength(0)
    })

    it('supports pagination with limit and after cursor', async () => {
      // Create two hostnames to guarantee there are at least 2 ranked items
      const r1 = Math.random().toString(36).slice(2, 8)
      const r2 = Math.random().toString(36).slice(2, 8)
      const id1 = await insertTestUrlHostname({ hostname: `top-api-page-a-${r1}.example.com` })
      const id2 = await insertTestUrlHostname({ hostname: `top-api-page-b-${r2}.example.com` })
      await setUrlHostnameVotes(id1, 7, 2)
      await setUrlHostnameVotes(id2, 6, 2)

      const request = createRequest()
      await request.authenticateAs(admin)
      const first = await request.get('/api/v1/hostnames/top?limit=1').expect(200)

      expect(first.body.page_info.has_next_page).toBe(true)
      const cursor = first.body.page_info.end_cursor
      const second = await request.get(`/api/v1/hostnames/top?limit=1&after=${cursor}`).expect(200)
      expect(second.body.results[0]?.id).not.toBe(first.body.results[0]?.id)
    })
  })
})
