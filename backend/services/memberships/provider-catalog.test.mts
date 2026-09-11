import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import { getMembershipProviderContext } from '@voucha/config/membership-providers'
import { createTestNativeMembershipProviderProduct, createTestSku } from '@voucha/test-helpers'
import { getActiveMembershipCatalogFromPrimary } from './provider-catalog.mts'

describe('membership provider catalog', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('requires each native provider application id in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APPLE_APP_STORE_APPLICATION_ID', undefined)

    expect(() => getMembershipProviderContext('apple_app_store')).toThrow(
      'APPLE_APP_STORE_APPLICATION_ID is required in production',
    )
  })

  it('returns only active-context provider mappings and preserves native price absence', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const stripe = await createTestSku({
      provider_environment: STRIPE_PROVIDER_ENVIRONMENT,
      provider_application_id: 'voucha-web',
      price_minor_units: 725,
      stripe_price_id: `price_catalog_${randomUUID()}`,
    })
    const appleProductId = `voucha.plus.monthly.${randomUUID()}`
    const inactiveGoogleProductId = `voucha.google.monthly.${randomUUID()}`
    await Promise.all([
      createTestNativeMembershipProviderProduct({
        membershipProductId: stripe.id,
        provider: 'apple_app_store',
        environment: 'test',
        applicationId: 'ai.voucha.ios',
        providerProductId: appleProductId,
      }),
      createTestNativeMembershipProviderProduct({
        membershipProductId: stripe.id,
        provider: 'google_play',
        environment: 'test',
        applicationId: `other-google-app-${randomUUID()}`,
        providerProductId: inactiveGoogleProductId,
      }),
    ])

    const product = (await getActiveMembershipCatalogFromPrimary()).find(
      candidate => candidate.id === stripe.id,
    )

    expect(product).toMatchObject({ id: stripe.id, plan: stripe.plan, interval: stripe.interval })
    expect(product?.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'stripe',
          product_id: stripe.stripe_price_id,
          price: { amount: 725, currency: 'usd' },
        }),
        expect.objectContaining({
          provider: 'apple_app_store',
          product_id: appleProductId,
          price: null,
        }),
      ]),
    )
    expect(product?.providers.map(provider => provider.product_id)).not.toContain(
      inactiveGoogleProductId,
    )
  })
})
