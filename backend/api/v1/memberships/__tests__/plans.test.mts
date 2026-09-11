import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import * as providerCatalog from '@services/memberships/provider-catalog'

describe('GET /api/v1/memberships/plans', () => {
  beforeEach(() => {
    vi.spyOn(providerCatalog, 'getActiveMembershipCatalogFromPrimary').mockResolvedValue([
      {
        id: '00000000-0000-7000-8000-000000000005',
        plan: 'plus',
        interval: 'yearly',
        providers: [
          {
            provider: 'stripe',
            environment: 'test',
            application_id: 'voucha-web',
            product_id: 'price_plans_fixture',
            base_plan_id: null,
            offer_id: null,
            sku_id: null,
            price: { amount: 600, currency: 'usd' },
          },
        ],
      },
    ])
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns a catalog product', async () => {
    const secondSku = {
      id: '00000000-0000-7000-8000-000000000005',
      stripe_price_id: 'price_plans_fixture',
    }
    const request = createRequest()
    const response = await request.get('/api/v1/memberships/plans').expect(200)

    const matchingProducts = response.body.products.filter(
      (product: { id: string }) => product.id === secondSku.id,
    )
    expect(matchingProducts).toHaveLength(1)
    expect(matchingProducts[0]).toMatchObject({
      providers: expect.arrayContaining([
        expect.objectContaining({
          provider: 'stripe',
          price: { amount: 600, currency: 'usd' },
          product_id: secondSku.stripe_price_id,
        }),
      ]),
    })
  })
})
