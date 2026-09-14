import { describe, expect, it, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect, insertSessionReferralAttribution } from '@voucha/test-helpers'
import { v7 as uuidv7 } from 'uuid'
import type { PrivateUser } from '@services/users/types'

describe('referral-clicks', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUserDirect()
  })

  describe('GET /api/v1/my/referral-clicks', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/my/referral-clicks').expect(401)
    })

    it('returns 200 with empty results for new user', async () => {
      const freshUser = await createTestUserDirect()
      const request = createRequest()
      await request.authenticateAs(freshUser)

      const response = await request.get('/api/v1/my/referral-clicks').expect(200)
      expect(response.body.results).toHaveLength(0)
      expect(response.body.page_info.has_next_page).toBe(false)
    })

    it('returns referral click log entries for authenticated user', async () => {
      const sessionId = uuidv7()
      const landingUrl = `https://example.com/api-test-${Date.now()}`
      await insertSessionReferralAttribution(sessionId, user.id, landingUrl)

      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request.get('/api/v1/my/referral-clicks').expect(200)

      const matchingResult = response.body.results.find(
        (r: { id: string }) => response.body.clicks[r.id]?.landing_url === landingUrl,
      )
      expect(matchingResult).toBeDefined()
      expect(response.body.clicks[matchingResult!.id].landing_url).toBe(landingUrl)
    })

    it('supports cursor pagination', async () => {
      const paginationUser = await createTestUserDirect()

      for (let i = 0; i < 3; i++) {
        await insertSessionReferralAttribution(
          uuidv7(),
          paginationUser.id,
          `https://example.com/pagination-api-${i}-${Date.now()}`,
        )
      }

      const request = createRequest()
      await request.authenticateAs(paginationUser)

      const page1 = await request.get('/api/v1/my/referral-clicks?limit=2').expect(200)
      expect(page1.body.results).toHaveLength(2)
      expect(page1.body.page_info.has_next_page).toBe(true)
      expect(page1.body.page_info.end_cursor).not.toBeNull()

      const cursor = encodeURIComponent(page1.body.page_info.end_cursor as string)
      const page2 = await request
        .get(`/api/v1/my/referral-clicks?limit=2&after=${cursor}`)
        .expect(200)
      expect(page2.body.results).toHaveLength(1)
      expect(page2.body.page_info.has_next_page).toBe(false)
    })
  })
})
