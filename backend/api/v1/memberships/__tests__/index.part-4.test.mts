import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestMembership, createTestSku, createTestUser } from '@voucha/test-helpers'
import * as stripePortal from '@modules/stripe/portal'
import {
  getMembershipByUserId,
  grantMembership,
  updateMembershipFromEvent,
} from '@services/memberships'
import type { PrivateUser } from '@services/users/types'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import { DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT } from '@services/memberships/create-types'

describe('retained direct subscription management', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a portal session while a grant owns the entitlement projection', async () => {
    vi.spyOn(stripePortal, 'createBillingPortalSession').mockResolvedValue({
      url: 'https://billing.stripe.com/mock',
    } as never)
    const portalUser = await createTestUser()
    const direct = await createTestMembership({
      user_id: portalUser.id,
      plan: 'plus',
      stripe_customer_id: `cus_retained_portal_${Date.now()}`,
      stripe_subscription_id: `sub_retained_portal_${Date.now()}`,
      provider_environment: STRIPE_PROVIDER_ENVIRONMENT,
      provider_application_id: DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT.applicationId,
    })
    await updateMembershipFromEvent(
      { membershipId: direct.id, status: 'paused' },
      async () => false,
    )
    const grantSku = await createTestSku({ plan: 'pro' })
    await grantMembership(admin.id, portalUser.id, 'pro', grantSku.id, 30)

    await expect(getMembershipByUserId(portalUser.id)).resolves.toMatchObject({
      plan: 'pro',
      stripe_subscription_id: null,
    })
    const request = createRequest()
    await request.authenticateAs(portalUser)
    const membershipResponse = await request.get('/api/v1/memberships/me').expect(200)
    expect(membershipResponse.body.membership).toMatchObject({
      plan: 'pro',
    })
    expect(membershipResponse.body.management).toEqual({
      provider: 'stripe',
      destination: 'billing_portal',
    })
    await request
      .post('/api/v1/memberships/billing-portal-sessions')
      .send({ return_url: '/my/membership' })
      .expect(200)

    expect(stripePortal.createBillingPortalSession).toHaveBeenCalledWith(
      expect.stringMatching(/^cus_retained_portal_/),
      expect.any(String),
      expect.any(String),
    )
  })
})
