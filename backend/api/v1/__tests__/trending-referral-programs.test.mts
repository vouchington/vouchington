import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/trending-referral-programs', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns referral programs list for anonymous users', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/trending-referral-programs').expect(200)
    expect(Array.isArray(response.body.referral_programs)).toBe(true)
    expect(response.body).toHaveProperty('page_info')
    expect(response.headers['cache-control']).toMatch(/public/)
  })

  it('returns referral programs list for authenticated users without public cache header', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/trending-referral-programs').expect(200)
    expect(Array.isArray(response.body.referral_programs)).toBe(true)
    const cacheControl = response.headers['cache-control'] as string | undefined
    expect(cacheControl == null || !cacheControl.includes('public')).toBe(true)
  })

  it('respects limit param', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/trending-referral-programs?limit=1').expect(200)
    expect(response.body.referral_programs.length).toBeLessThanOrEqual(1)
  })

  it('keeps pagination parser failures before execution', async () => {
    const request = createRequest()
    await request.get('/api/v1/trending-referral-programs?limit=100').expect(200)
    await request.get('/api/v1/trending-referral-programs?limit=0').expect(400)
  })
})
