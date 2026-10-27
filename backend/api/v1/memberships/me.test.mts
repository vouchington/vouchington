import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestPendingMembershipVerification, createTestUser } from '@voucha/test-helpers'
import { createTestSku } from '@voucha/test-helpers/entities/memberships'
import { rejectUnavailableMembershipProvider } from '@services/memberships/provider-unavailable'

describe('GET /api/v1/memberships/me', () => {
  it('returns verification outcomes without queue scheduling fields', async () => {
    const user = await createTestUser()
    const verificationId = await createTestPendingMembershipVerification(user.id)
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/memberships/me').expect(200)

    expect(response.body.pending.verifications).toEqual([
      { id: verificationId, provider: 'apple_app_store', status: 'pending', reason_code: null },
    ])

    await rejectUnavailableMembershipProvider(verificationId)
    const rejected = await request
      .get(`/api/v1/membership-verifications/${verificationId}`)
      .expect(200)
    expect(rejected.body.verification).toMatchObject({
      id: verificationId,
      status: 'rejected',
      reason_code: 'provider_unavailable',
    })
    const overview = await request.get('/api/v1/memberships/me').expect(200)
    expect(overview.body.pending.verifications).toEqual([
      {
        id: verificationId,
        provider: 'apple_app_store',
        status: 'rejected',
        reason_code: 'provider_unavailable',
      },
    ])
  })

  it('does not expose canonical Stripe SKU pricing for an admin grant', async () => {
    const memberUser = await createTestUser()
    const adminUser = await createTestUser({ administrator: true })
    const sku = await createTestSku({ plan: 'plus' })
    const grantRequest = createRequest()
    await grantRequest.authenticateAs(adminUser)
    await grantRequest
      .post('/api/v1/membership-grants')
      .send({
        duration_days: 30,
        plan: 'plus',
        sku_id: sku.id,
        user_id: memberUser.id,
      })
      .expect(201)

    const request = createRequest()
    await request.authenticateAs(memberUser)
    const response = await request.get('/api/v1/memberships/me').expect(200)

    expect(response.body.membership).toMatchObject({
      granted_by_id: adminUser.id,
      product: {
        id: sku.id,
        plan: 'plus',
        interval: 'monthly',
      },
    })
    expect(response.body.membership).not.toHaveProperty('sku')
    expect(response.body.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ is_effective: true, renewal: null, status: 'active' }),
      ]),
    )
  })
})
