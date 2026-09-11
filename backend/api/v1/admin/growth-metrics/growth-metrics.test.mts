import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import type { PrivateUser } from '@services/users/types'

describe('growth-metrics', () => {
  let adminUser: PrivateUser
  let investorUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[adminUser, investorUser, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser().then(async u => {
        await addUserRole(u!.id, 'investor')
        return u!
      }),
      createTestUser(),
    ])
  })

  describe('GET /api/v1/growth-metrics', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/growth-metrics').expect(401)
    })

    it('returns 403 for regular users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/growth-metrics').expect(403)
    })

    it('returns 200 for admin users with expected shape', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser)
      const response = await request.get('/api/v1/growth-metrics').expect(200)

      expect(response.body).toHaveProperty('range', '30d')
      expect(response.body).toHaveProperty('period_start')
      expect(response.body).toHaveProperty('period_end')
      expect(response.body).toHaveProperty('user_growth')
      expect(response.body).toHaveProperty('content_production')
      expect(response.body).toHaveProperty('engagement')
      expect(response.body).toHaveProperty('network_effects')
      expect(response.body).toHaveProperty('revenue')
      expect(response.body).toHaveProperty('infrastructure')
    })

    it('returns 200 for investor users', async () => {
      const request = createRequest()
      await request.authenticateAs(investorUser)
      const response = await request.get('/api/v1/growth-metrics').expect(200)

      expect(response.body).toHaveProperty('range', '30d')
    })

    it('accepts valid range params', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser)

      for (const range of ['today', '7d', '30d', '90d', 'all']) {
        const response = await request.get(`/api/v1/growth-metrics?range=${range}`).expect(200)
        expect(response.body.range).toBe(range)
      }
    })

    it('falls back to 30d for invalid range param', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser)
      const response = await request.get('/api/v1/growth-metrics?range=invalid').expect(200)
      expect(response.body.range).toBe('30d')
    })

    it('user_growth has expected numeric fields', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser)
      const response = await request.get('/api/v1/growth-metrics?range=7d').expect(200)

      const { user_growth } = response.body
      expect(typeof user_growth.total_users).toBe('number')
      expect(typeof user_growth.new_users).toBe('number')
      expect(typeof user_growth.dau).toBe('number')
      expect(typeof user_growth.mau).toBe('number')
      expect(typeof user_growth.dau_mau_ratio).toBe('number')
      expect(Array.isArray(user_growth.signups_over_time)).toBe(true)
    })

    it('content_production has expected fields', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser)
      const response = await request.get('/api/v1/growth-metrics?range=30d').expect(200)

      const { content_production } = response.body
      expect(typeof content_production.total_posts).toBe('number')
      expect(content_production.posts_by_type).toHaveProperty('review')
      expect(content_production.posts_by_type).toHaveProperty('data_point')
      expect(content_production.posts_by_type).toHaveProperty('discussion')
      expect(content_production.posts_by_type).toHaveProperty('comment')
      expect(content_production.posts_by_type).toHaveProperty('story')
    })

    it('network_effects has expected fields', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser)
      const response = await request.get('/api/v1/growth-metrics').expect(200)

      const { network_effects } = response.body
      expect(typeof network_effects.referral_coefficient).toBe('number')
      expect(typeof network_effects.topic_coverage_rate).toBe('number')
      expect(typeof network_effects.landing_page_visits).toBe('number')
      expect(typeof network_effects.signup_visit_ratio).toBe('number')
    })

    it('revenue has expected fields', async () => {
      const request = createRequest()
      await request.authenticateAs(adminUser)
      const response = await request.get('/api/v1/growth-metrics').expect(200)

      const { revenue } = response.body
      expect(typeof revenue.active_memberships).toBe('number')
      expect(Array.isArray(revenue.mrr_by_currency)).toBe(true)
      expect(typeof revenue.churn_rate).toBe('number')
    })
  })
})
