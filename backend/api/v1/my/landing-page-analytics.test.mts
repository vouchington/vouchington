import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUserDirect,
  createTestLandingPage,
  createTestMembership,
  updateTestMembershipExpiresAt,
  setUserReferrerId,
} from '@voucha/test-helpers'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { v7 } from 'uuid'

describe('landing-page-analytics', () => {
  let userId: string
  let landingPageId: string
  let deviceToken: { token: string }
  let sessionToken: { token: string }

  beforeAll(async () => {
    const user = await createTestUserDirect()
    userId = user!.id
    await createTestMembership({ user_id: userId, plan: 'plus' })

    const did = v7()
    const tokens = await createDeviceAndSessionTokens({ did, uid: userId })
    deviceToken = tokens.deviceToken
    sessionToken = tokens.sessionToken

    const { landingPageId: pageId } = await createTestLandingPage(
      userId,
      'Analytics Dashboard Test',
    )
    landingPageId = pageId
  })

  describe('GET /api/v1/my/landing-pages/:pageId/analytics', () => {
    it('returns analytics for an eligible paid user', async () => {
      const request = createRequest()
      request.set('Cookie', [`dt=${deviceToken.token}`, `st=${sessionToken.token}`])

      const res = await request
        .get(`/api/v1/my/landing-pages/${landingPageId}/analytics`)
        .expect(200)

      expect(res.body.analytics).toBeDefined()
      expect(typeof res.body.analytics.total_visits).toBe('number')
      expect(typeof res.body.analytics.total_clicks).toBe('number')
      expect(Array.isArray(res.body.analytics.item_clicks)).toBe(true)
      expect(Array.isArray(res.body.analytics.daily_stats)).toBe(true)
    })

    it('returns 403 for a free user', async () => {
      const freeUser = await createTestUserDirect()
      const { landingPageId: freeLandingPageId } = await createTestLandingPage(
        freeUser!.id,
        'Free Analytics Dashboard Test',
      )
      const tokens = await createDeviceAndSessionTokens({ did: v7(), uid: freeUser!.id })
      const request = createRequest()
      request.set('Cookie', [`dt=${tokens.deviceToken.token}`, `st=${tokens.sessionToken.token}`])

      await request.get(`/api/v1/my/landing-pages/${freeLandingPageId}/analytics`).expect(403)
    })

    it('returns 403 after a finite paid grant expires', async () => {
      const elapsedUser = await createTestUserDirect()
      const membership = await createTestMembership({ user_id: elapsedUser!.id, plan: 'plus' })
      await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 1_000))
      const { landingPageId: elapsedLandingPageId } = await createTestLandingPage(
        elapsedUser!.id,
        'Elapsed Analytics Dashboard Test',
      )
      const tokens = await createDeviceAndSessionTokens({ did: v7(), uid: elapsedUser!.id })
      const request = createRequest()
      request.set('Cookie', [`dt=${tokens.deviceToken.token}`, `st=${tokens.sessionToken.token}`])

      await request.get(`/api/v1/my/landing-pages/${elapsedLandingPageId}/analytics`).expect(403)
    })

    it('returns 401 without authentication', async () => {
      const request = createRequest()
      await request.get(`/api/v1/my/landing-pages/${landingPageId}/analytics`).expect(401)
    })

    it('returns 404 for another user landing page', async () => {
      const otherUser = await createTestUserDirect()
      await createTestMembership({ user_id: otherUser!.id, plan: 'plus', status: 'active' })
      const did = v7()
      const tokens = await createDeviceAndSessionTokens({ did, uid: otherUser!.id })
      const request = createRequest()
      request.set('Cookie', [`dt=${tokens.deviceToken.token}`, `st=${tokens.sessionToken.token}`])

      await request.get(`/api/v1/my/landing-pages/${landingPageId}/analytics`).expect(404)
    })

    it('includes unique_visitors in response', async () => {
      const request = createRequest()
      request.set('Cookie', [`dt=${deviceToken.token}`, `st=${sessionToken.token}`])

      const res = await request
        .get(`/api/v1/my/landing-pages/${landingPageId}/analytics`)
        .expect(200)

      expect(typeof res.body.analytics.unique_visitors).toBe('number')
    })

    it('includes utm_sources in response', async () => {
      const request = createRequest()
      request.set('Cookie', [`dt=${deviceToken.token}`, `st=${sessionToken.token}`])

      const res = await request
        .get(`/api/v1/my/landing-pages/${landingPageId}/analytics`)
        .expect(200)

      expect(Array.isArray(res.body.analytics.utm_sources)).toBe(true)
    })

    it('includes conversion_funnel in response', async () => {
      const request = createRequest()
      request.set('Cookie', [`dt=${deviceToken.token}`, `st=${sessionToken.token}`])

      const res = await request
        .get(`/api/v1/my/landing-pages/${landingPageId}/analytics`)
        .expect(200)

      const funnel = res.body.analytics.conversion_funnel
      expect(funnel).toBeDefined()
      expect(typeof funnel.total_visits).toBe('number')
      expect(typeof funnel.total_clicks).toBe('number')
      expect(typeof funnel.total_signups).toBe('number')
      expect(typeof funnel.visit_to_click_rate).toBe('number')
      expect(funnel.visit_to_signup_rate).toBeUndefined()
    })

    it('counts signups using the landing page owner id', async () => {
      const request = createRequest()
      request.set('Cookie', [`dt=${deviceToken.token}`, `st=${sessionToken.token}`])

      const before = await request
        .get(`/api/v1/my/landing-pages/${landingPageId}/analytics`)
        .expect(200)

      const referredA = await createTestUserDirect()
      const referredB = await createTestUserDirect()
      await Promise.all([
        setUserReferrerId(referredA!.id, userId),
        setUserReferrerId(referredB!.id, userId),
      ])

      const after = await request
        .get(`/api/v1/my/landing-pages/${landingPageId}/analytics`)
        .expect(200)

      expect(
        after.body.analytics.conversion_funnel.total_signups -
          before.body.analytics.conversion_funnel.total_signups,
      ).toBe(2)
    })
  })
})
