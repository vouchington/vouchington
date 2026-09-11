import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

describe('compare-hostnames', () => {
  let admin: PrivateUser
  let hostnameId1: string
  let hostnameId2: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    hostnameId1 = await insertTestUrlHostname({ hostname: `compare-1-${random}.example.com` })
    hostnameId2 = await insertTestUrlHostname({ hostname: `compare-2-${random}.example.com` })
  })

  describe('GET /api/v1/hostnames/compare', () => {
    it('returns 400 when no ids provided', async () => {
      const request = createRequest()
      await request.get('/api/v1/hostnames/compare').expect(400)
    })

    it('returns 400 when more than 10 ids provided', async () => {
      const ids = Array.from(
        { length: 11 },
        (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      )
      const request = createRequest()
      await request.get(`/api/v1/hostnames/compare?ids=${ids.join(',')}`).expect(400)
    })

    it('returns 200 with hostnames and elections', async () => {
      const request = createRequest()
      const response = await request
        .get(`/api/v1/hostnames/compare?ids=${hostnameId1},${hostnameId2}`)
        .expect(200)

      expect(response.body.hostnames).toBeDefined()
      expect(response.body.hostname_elections).toBeDefined()
      expect(response.body.topics).toBeDefined()

      expect(response.body.hostnames[hostnameId1]).toBeDefined()
      expect(response.body.hostnames[hostnameId2]).toBeDefined()
      expect(response.body.hostnames[hostnameId1].votes_score_net).toBeUndefined()
      expect(response.body.hostnames[hostnameId1].votes_count_up).toBeUndefined()
      expect(response.body.hostnames[hostnameId1].votes_count_down).toBeUndefined()
      expect(response.body.hostname_elections[hostnameId1]).toBeDefined()
    })

    it('resolves duplicate identifiers to a single row', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const hostname = `compare-mixed-${random}.example.com`
      const hostnameId = await insertTestUrlHostname({ hostname })

      const request = createRequest()
      const response = await request
        .get(`/api/v1/hostnames/compare?ids=${hostnameId},${hostname.toUpperCase()}`)
        .expect(200)

      expect(Object.keys(response.body.hostnames)).toEqual([hostnameId])
      expect(response.body.hostnames[hostnameId].hostname).toBe(hostname)
      expect(response.body.hostname_elections[hostnameId]).toBeDefined()
    })

    it('returns cache-control header for anonymous users', async () => {
      const request = createRequest()
      const response = await request.get(`/api/v1/hostnames/compare?ids=${hostnameId1}`).expect(200)

      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['cache-control']).toContain(
        `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
      )
    })

    it('does not set cache-control for authenticated users', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/hostnames/compare?ids=${hostnameId1}`).expect(200)

      expect(response.headers['cache-control']).toBeUndefined()
    })

    it('returns only non-blocked hostnames to non-admin users', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const blockedId = await insertTestUrlHostname({
        hostname: `compare-blocked-${random}.example.com`,
        blocked: true,
      })

      const request = createRequest()
      const response = await request
        .get(`/api/v1/hostnames/compare?ids=${hostnameId1},${blockedId}`)
        .expect(200)

      expect(response.body.hostnames[hostnameId1]).toBeDefined()
      expect(response.body.hostnames[blockedId]).toBeUndefined()
    })

    it('shows blocked hostnames to admin users', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const blockedId = await insertTestUrlHostname({
        hostname: `compare-blocked-admin-${random}.example.com`,
        blocked: true,
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get(`/api/v1/hostnames/compare?ids=${blockedId}`).expect(200)

      expect(response.body.hostnames[blockedId]).toBeDefined()
    })

    it('handles non-existent hostname ids gracefully', async () => {
      const request = createRequest()
      const response = await request
        .get('/api/v1/hostnames/compare?ids=00000000-0000-0000-0000-000000000000')
        .expect(200)

      expect(response.body.hostnames).toEqual({})
    })

    it('handles non-existent hostname strings gracefully', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const request = createRequest()
      const response = await request
        .get(`/api/v1/hostnames/compare?ids=missing-hostname-${random}.example.com`)
        .expect(200)

      expect(response.body.hostnames).toEqual({})
    })
  })
})
