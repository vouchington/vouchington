import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import { insertTestTopic, createTestUser } from '@voucha/test-helpers'

describe('topics', () => {
  describe('anon limit clamping for topics', () => {
    let user: PrivateUser
    const marker = Math.random().toString(36).slice(2, 8)
    const query = `/api/v1/topics?q=${encodeURIComponent(marker)}&limit=100`

    beforeAll(async () => {
      user = await createTestUser({ administrator: true })
    })

    beforeAll(async () => {
      const anonTopicsUser = await createTestUser({ administrator: true })
      // 26 is the minimum fixture size that still distinguishes clamped (25) from unclamped: one
      // more topic than the anon clamp so the authed assertion below can't pass by coincidence.
      for (let i = 0; i < 26; i++) {
        await insertTestTopic({
          name: `Anon Limit Topic ${marker} ${i}`,
          slug: `anon-limit-topic-${marker}-${i}`,
          createdById: anonTopicsUser.id,
        })
      }
    })

    it('unauthenticated request with limit=100 returns at most 25 results', async () => {
      const request = createRequest()
      const response = await request.get(query).expect(200)
      expect(response.body.results).toHaveLength(25)
    })

    it('authenticated request with limit=100 can return up to 100 results', async () => {
      const request = createRequest()
      await request.authenticateAs(user!)
      const response = await request.get(query).expect(200)
      expect(response.body.results).toHaveLength(26)
    })
  })
})
