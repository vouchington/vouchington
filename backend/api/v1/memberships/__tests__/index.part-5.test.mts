import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import * as stripePortal from '@modules/stripe/portal'
import type { PrivateUser } from '@services/users/types'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import { DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT } from '@services/memberships/create-types'

describe('membership management routes', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('POST /api/v1/memberships/billing-portal-sessions', () => {
    beforeEach(() => {
      vi.spyOn(stripePortal, 'createBillingPortalSession').mockResolvedValue({
        url: 'https://billing.stripe.com/mock',
      } as never)
    })

    it('returns 401 without authentication', async () => {
      const request = createRequest()
      await request
        .post('/api/v1/memberships/billing-portal-sessions')
        .send({ return_url: '/my/membership' })
        .expect(401)
    })

    it('returns 400 for missing return_url', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.post('/api/v1/memberships/billing-portal-sessions').send({}).expect(400)
    })

    it('returns 400 when user has no Stripe subscription', async () => {
      const grantedUser = await createTestUser()
      await createTestMembership({ user_id: grantedUser.id, granted_by_id: admin.id })

      const request = createRequest()
      await request.authenticateAs(grantedUser)
      await request
        .post('/api/v1/memberships/billing-portal-sessions')
        .send({ return_url: '/my/membership' })
        .expect(400)
    })

    it('returns 400 for non-relative return_url', async () => {
      const portalUser = await createTestUser()
      await createTestMembership({
        user_id: portalUser.id,
        stripe_customer_id: 'cus_test_portal',
        stripe_subscription_id: `sub_test_portal_${Date.now()}`,
        provider_environment: STRIPE_PROVIDER_ENVIRONMENT,
        provider_application_id: DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT.applicationId,
      })

      const request = createRequest()
      await request.authenticateAs(portalUser)
      await request
        .post('/api/v1/memberships/billing-portal-sessions')
        .send({ return_url: 'https://evil.com' })
        .expect(400)
    })

    it('creates billing portal session', async () => {
      const portalUser = await createTestUser()
      await createTestMembership({
        user_id: portalUser.id,
        stripe_customer_id: 'cus_test_portal_2',
        stripe_subscription_id: `sub_test_portal_2_${Date.now()}`,
        provider_environment: STRIPE_PROVIDER_ENVIRONMENT,
        provider_application_id: DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT.applicationId,
      })

      const request = createRequest()
      await request.authenticateAs(portalUser)
      const response = await request
        .post('/api/v1/memberships/billing-portal-sessions')
        .send({ return_url: '/my/membership' })
        .expect(200)

      expect(response.body.portal_session).toHaveProperty('url')
      expect(stripePortal.createBillingPortalSession).toHaveBeenCalledOnce()
    })
  })
})
