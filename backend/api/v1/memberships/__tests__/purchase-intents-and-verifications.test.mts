import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stripeCheckout from '@modules/stripe/checkout'
import * as stripeCustomers from '@modules/stripe/customers'
import { membershipBillingControls } from '@services/memberships/purchase-controls'
import { getStripePurchaseIntentOwner } from '@services/memberships'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestMembership,
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'

describe('membership purchase intents and verifications', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('creates and exactly replays a Stripe purchase intent', async () => {
    const user = await createTestUser()
    const restore = overrideDynamicConfigFieldsForTest(membershipBillingControls, {
      stripe_enabled: true,
    })
    try {
      const sku = await createTestSku({
        provider_application_id: 'voucha-web',
        provider_environment: STRIPE_PROVIDER_ENVIRONMENT,
      })
      vi.spyOn(stripeCustomers, 'getOrCreateStripeCustomer').mockResolvedValue({
        id: 'cus_1',
      } as never)
      const createCheckout = vi.spyOn(stripeCheckout, 'createCheckoutSession').mockResolvedValue({
        id: 'cs_1',
        url: 'https://checkout.stripe.test/session',
      } as never)
      const body = { provider: 'stripe', product_id: sku.id, idempotency_key: randomUUID() }
      const request = createRequest()
      await request.authenticateAs(user)
      const first = await request.post('/api/v1/membership-purchase-intents').send(body).expect(201)
      const replay = await request
        .post('/api/v1/membership-purchase-intents')
        .send(body)
        .expect(200)

      expect(replay.body.purchase_intent.id).toBe(first.body.purchase_intent.id)
      expect(first.body.purchase_intent.launch).toEqual({
        kind: 'stripe_checkout',
        checkout_url: 'https://checkout.stripe.test/session',
      })
      expect(createCheckout).toHaveBeenCalledOnce()
      await expect(
        getStripePurchaseIntentOwner({
          purchaseIntentId: first.body.purchase_intent.id,
          environment: STRIPE_PROVIDER_ENVIRONMENT,
          providerProductId: sku.stripe_price_id,
        }),
      ).resolves.toBe(user.id)
      await expect(
        getStripePurchaseIntentOwner({
          purchaseIntentId: first.body.purchase_intent.id,
          environment: STRIPE_PROVIDER_ENVIRONMENT === 'test' ? 'production' : 'test',
          providerProductId: sku.stripe_price_id,
        }),
      ).resolves.toBeNull()
    } finally {
      restore()
    }
  })

  it('persists native evidence before returning an owner-scoped verification', async () => {
    const user = await createTestUser()
    const restore = overrideDynamicConfigFieldsForTest(membershipBillingControls, {
      apple_app_store_enabled: true,
    })
    try {
      const sku = await createTestSku({ provider_environment: 'test' })
      await createTestNativeMembershipProviderProduct({
        membershipProductId: sku.id,
        provider: 'apple_app_store',
        environment: 'test',
        applicationId: 'ai.voucha.ios',
        providerProductId: `voucha.plus.monthly.${randomUUID()}`,
      })
      const request = createRequest()
      await request.authenticateAs(user)
      const intent = await request
        .post('/api/v1/membership-purchase-intents')
        .send({
          provider: 'apple_app_store',
          product_id: sku.id,
          idempotency_key: randomUUID(),
        })
        .expect(201)
      const response = await request
        .post('/api/v1/membership-verifications')
        .send({
          provider: 'apple_app_store',
          purchase_intent_id: intent.body.purchase_intent.id,
          idempotency_key: randomUUID(),
          evidence: { signed_transaction: 'bounded-test-evidence' },
        })
        .expect(202)
      expect(response.body.verification).toMatchObject({
        provider: 'apple_app_store',
        status: 'pending',
      })
      const overview = await request.get('/api/v1/memberships/me').expect(200)
      expect(overview.body.pending.verifications).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: response.body.verification.id, status: 'pending' }),
        ]),
      )
    } finally {
      restore()
    }
  })

  it('replays an existing launch after its new-purchase gate is disabled', async () => {
    const replayUser = await createTestUser()
    const sku = await createTestSku({ provider_environment: 'test' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'apple_app_store',
      environment: 'test',
      applicationId: 'ai.voucha.ios',
      providerProductId: `voucha.plus.monthly.${randomUUID()}`,
    })
    const restore = overrideDynamicConfigFieldsForTest(membershipBillingControls, {
      apple_app_store_enabled: true,
    })
    const request = createRequest()
    await request.authenticateAs(replayUser)
    const body = {
      provider: 'apple_app_store',
      product_id: sku.id,
      idempotency_key: randomUUID(),
    }
    let first: Awaited<ReturnType<typeof request.post>>
    try {
      first = await request.post('/api/v1/membership-purchase-intents').send(body).expect(201)
    } finally {
      restore()
    }
    const replay = await request.post('/api/v1/membership-purchase-intents').send(body).expect(200)
    expect(replay.body.purchase_intent).toEqual({
      ...first.body.purchase_intent,
      replayed: true,
    })
  })

  it('admits only one concurrent launch across distinct idempotency keys', async () => {
    const concurrentUser = await createTestUser()
    const sku = await createTestSku({ provider_environment: 'test' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId: 'ai.voucha.android',
      providerProductId: `voucha.plus.monthly.${randomUUID()}`,
    })
    const restore = overrideDynamicConfigFieldsForTest(membershipBillingControls, {
      google_play_enabled: true,
    })
    try {
      const createIntent = async () => {
        const request = createRequest()
        await request.authenticateAs(concurrentUser)
        return request.post('/api/v1/membership-purchase-intents').send({
          provider: 'google_play',
          product_id: sku.id,
          idempotency_key: randomUUID(),
        })
      }
      const responses = await Promise.all([createIntent(), createIntent()])
      expect(responses.map(response => response.status).sort()).toEqual([201, 409])
      expect(responses.find(response => response.status === 409)?.body).toMatchObject({
        code: 'CONFLICT',
        eligible_at: expect.any(String),
        management: null,
      })
    } finally {
      restore()
    }
  })

  it('returns the current provider management destination for competing purchases', async () => {
    const competingUser = await createTestUser()
    await createTestMembership({
      user_id: competingUser.id,
      stripe_customer_id: `cus_${randomUUID()}`,
    })
    const sku = await createTestSku({ provider_environment: 'test' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'apple_app_store',
      environment: 'test',
      applicationId: 'ai.voucha.ios',
      providerProductId: `voucha.plus.monthly.${randomUUID()}`,
    })
    const restore = overrideDynamicConfigFieldsForTest(membershipBillingControls, {
      apple_app_store_enabled: true,
    })
    try {
      const request = createRequest()
      await request.authenticateAs(competingUser)
      const body = {
        provider: 'apple_app_store',
        product_id: sku.id,
        idempotency_key: randomUUID(),
      }
      const first = await request.post('/api/v1/membership-purchase-intents').send(body).expect(409)
      const replay = await request
        .post('/api/v1/membership-purchase-intents')
        .send(body)
        .expect(409)

      expect(first.body).toEqual({
        error: 'Membership purchase is not eligible.',
        code: 'CONFLICT',
        eligible_at: null,
        management: { provider: 'stripe', destination: 'billing_portal' },
      })
      expect(replay.body).toEqual(first.body)
    } finally {
      restore()
    }
  })

  it('persists and exactly replays out-of-flow evidence without exposing it cross-account', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const body = {
      provider: 'google_play',
      idempotency_key: randomUUID(),
      evidence: { purchase_token: `token-${randomUUID()}` },
    }
    const first = await request.post('/api/v1/membership-verifications').send(body).expect(202)
    const replay = await request.post('/api/v1/membership-verifications').send(body).expect(200)
    expect(replay.body.verification).toEqual(first.body.verification)
    expect(first.body.verification).not.toHaveProperty('replayed')

    await request
      .post('/api/v1/membership-verifications')
      .send({ ...body, evidence: { purchase_token: `different-${randomUUID()}` } })
      .expect(409)

    const otherUser = await createTestUser()
    const otherRequest = createRequest()
    await otherRequest.authenticateAs(otherUser)
    await otherRequest
      .get(`/api/v1/membership-verifications/${first.body.verification.id}`)
      .expect(404)
  })
})
