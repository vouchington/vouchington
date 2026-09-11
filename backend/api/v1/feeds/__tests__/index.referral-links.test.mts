import { describe, it, expect } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  followUser,
  insertTestReferralProgram,
  insertTestUserReferralProgramLink,
  createTestUrlWithHostname,
} from '@voucha/test-helpers'

describe('GET /api/v1/feeds/referral_links/:feed_type', () => {
  it('returns 401 for unauthenticated users', async () => {
    const request = createRequest()
    await request.get('/api/v1/feeds/referral_links/follow_users').expect(401)
  })

  it('returns 404 for invalid feed_type', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    await request.get('/api/v1/feeds/referral_links/invalid_type').expect(404)
  })

  it('returns 200 with empty results when user has no follows', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/referral_links/follow_users').expect(200)

    expect(response.body.results).toEqual([])
    expect(response.body.page_info.has_next_page).toBe(false)
  })

  it('returns 200 with referral links from followed users', async () => {
    const user = await createTestUser()
    const friend = await createTestUser()
    await followUser(user, friend)

    const referralProgramId = await insertTestReferralProgram({ createdById: friend.id })
    const urlId = await createTestUrlWithHostname()
    const linkId = await insertTestUserReferralProgramLink({
      userId: friend.id,
      referralProgramId,
      urlId,
    })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/referral_links/follow_users').expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    const found = response.body.results.find((r: { id: string }) => r.id === linkId)
    expect(found).toBeDefined()
    expect(found?.user_id).toBe(friend.id)
  })

  it('returns 200 for mutual_follows feed type', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/referral_links/mutual_follows').expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.page_info).toBeDefined()
  })
})
