import { randomUUID } from 'node:crypto'
import { describe, it } from 'vitest'
import { membershipBillingControls } from '@services/memberships/purchase-controls'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
  markTestMembershipPurchaseIntentFailed,
} from '@voucha/test-helpers'

describe('membership purchase intent and verification failures', () => {
  it('rejects disabled provider purchase intents', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/membership-purchase-intents')
      .send({
        provider: 'apple_app_store',
        product_id: randomUUID(),
        idempotency_key: randomUUID(),
      })
      .expect(503)
  })

  it('rejects enabled provider purchase intents without an active mapping', async () => {
    const user = await createTestUser()
    const restore = overrideDynamicConfigFieldsForTest(membershipBillingControls, {
      apple_app_store_enabled: true,
    })
    try {
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post('/api/v1/membership-purchase-intents')
        .send({
          provider: 'apple_app_store',
          product_id: randomUUID(),
          idempotency_key: randomUUID(),
        })
        .expect(400)
    } finally {
      restore()
    }
  })

  it('rejects an idempotency key reused for another purchase product', async () => {
    const { request, sku } = await createApplePurchaseRequest()
    const otherSku = await createTestSku({ plan: 'pro', provider_environment: 'test' })
    const idempotencyKey = randomUUID()
    const restore = overrideDynamicConfigFieldsForTest(membershipBillingControls, {
      apple_app_store_enabled: true,
    })
    try {
      await request
        .post('/api/v1/membership-purchase-intents')
        .send({ provider: 'apple_app_store', product_id: sku.id, idempotency_key: idempotencyKey })
        .expect(201)
      await request
        .post('/api/v1/membership-purchase-intents')
        .send({
          provider: 'apple_app_store',
          product_id: otherSku.id,
          idempotency_key: idempotencyKey,
        })
        .expect(409)
    } finally {
      restore()
    }
  })

  it('rejects replay of a failed native purchase intent', async () => {
    const { request, sku } = await createApplePurchaseRequest()
    const restore = overrideDynamicConfigFieldsForTest(membershipBillingControls, {
      apple_app_store_enabled: true,
    })
    try {
      const body = {
        provider: 'apple_app_store' as const,
        product_id: sku.id,
        idempotency_key: randomUUID(),
      }
      const created = await request
        .post('/api/v1/membership-purchase-intents')
        .send(body)
        .expect(201)
      await markTestMembershipPurchaseIntentFailed(created.body.purchase_intent.id)
      await request.post('/api/v1/membership-purchase-intents').send(body).expect(409)
    } finally {
      restore()
    }
  })

  it('returns an owner-scoped verification and rejects oversized evidence before persistence', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const verification = await request
      .post('/api/v1/membership-verifications')
      .send({
        provider: 'google_play',
        idempotency_key: randomUUID(),
        evidence: { purchase_token: `token-${randomUUID()}` },
      })
      .expect(202)
    await request
      .get(`/api/v1/membership-verifications/${verification.body.verification.id}`)
      .expect(200)
    await request
      .post('/api/v1/membership-verifications')
      .send({
        provider: 'google_play',
        idempotency_key: randomUUID(),
        evidence: { purchase_token: 'a'.repeat(32_768) },
      })
      .expect(413)
  })
})

async function createApplePurchaseRequest() {
  const user = await createTestUser()
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
  return { request, sku }
}
