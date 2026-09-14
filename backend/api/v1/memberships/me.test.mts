import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createTestSku } from '@voucha/test-helpers/entities/memberships'

describe('GET /api/v1/memberships/me', () => {
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
