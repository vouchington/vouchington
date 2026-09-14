import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestUrlHostname,
  insertTestLocalFollow,
  createTestTopic,
  upsertHostnameVote,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getUrlHostnameByAny } from '@services/urls-hostnames'

describe('social-hostnames', () => {
  let currentUser: PrivateUser
  let friend: PrivateUser
  let trustedHostnameId: string

  beforeAll(async () => {
    currentUser = await createTestUser()
    friend = await createTestUser()
    await insertTestLocalFollow(currentUser.id, friend.id)

    const random = Math.random().toString(36).slice(2, 8)
    trustedHostnameId = await insertTestUrlHostname({
      hostname: `social-api-${random}.example.com`,
    })
    await upsertHostnameVote(trustedHostnameId, friend.id, 1)
  })

  describe('GET /api/v1/hostnames/social', () => {
    it('returns 401 for unauthenticated users', async () => {
      const request = createRequest()
      await request.get('/api/v1/hostnames/social').expect(401)
    })

    it('returns 200 with results for authenticated users', async () => {
      const request = createRequest()
      await request.authenticateAs(currentUser)
      const response = await request.get('/api/v1/hostnames/social').expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.page_info).toBeDefined()
      expect(response.body.hostnames).toBeDefined()
      expect(response.body.hostname_elections).toBeDefined()
      expect(response.body.topics).toBeDefined()
    })

    it('includes friend-trusted hostname in results', async () => {
      const request = createRequest()
      await request.authenticateAs(currentUser)
      const response = await request.get('/api/v1/hostnames/social?limit=100').expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(trustedHostnameId)
    })

    it('includes linked topic sidecars for trusted hostnames', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const hostname = `social-topic-${random}.example.com`
      const topic = await createTestTopic({ hostname })
      const linkedHostname = await getUrlHostnameByAny(hostname)
      if (!linkedHostname) throw new Error('Expected linked test hostname to exist')
      await upsertHostnameVote(linkedHostname.id, friend.id, 1)

      const request = createRequest()
      await request.authenticateAs(currentUser)
      const response = await request.get('/api/v1/hostnames/social?limit=100').expect(200)

      expect(response.body.hostnames[linkedHostname.id]?.topic_id).toBe(topic.id)
      expect(response.body.topics[topic.id]?.id).toBe(topic.id)
    })

    it('sets private, no-store cache-control header', async () => {
      const request = createRequest()
      await request.authenticateAs(currentUser)
      const response = await request.get('/api/v1/hostnames/social').expect(200)
      expect(response.headers['cache-control']).toBe('private, no-store')
    })

    it('returns empty results for user with no friends', async () => {
      const lonelyUser = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(lonelyUser)
      const response = await request.get('/api/v1/hostnames/social').expect(200)
      expect(response.body.results).toHaveLength(0)
      expect(response.body.page_info.has_next_page).toBe(false)
    })
  })
})
