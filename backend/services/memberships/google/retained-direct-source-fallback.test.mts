import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId } from '@services/memberships'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUnprojectedProviderObservation,
  createTestUser,
} from '@voucha/test-helpers'
import { createMembership } from '../create.mts'
import { projectVerifiedProviderMembershipObservation } from '../provider-observation-projection.mts'
import { updateMembershipFromEvent } from '../update.mts'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import type { GooglePlaySubscriptionsV2Client } from './types.mts'

describe('retained Google Play direct sources', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('retains a verified Google direct purchase blocked by another direct source and restores it after that source ends', async () => {
    const fixture = await createGooglePlayFixture()
    const coveringSku = await createTestSku({ plan: 'pro' })
    const covering = await createMembership({
      userId: fixture.user.id,
      plan: 'pro',
      skuId: coveringSku.id,
      stripeSubscriptionId: `sub_google_retained_${randomUUID()}`,
    })
    const verification = await createMembershipVerification({
      userId: fixture.user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: `google-retained-${randomUUID()}` },
    })

    await processGooglePlayMembershipVerification(verification.id, {
      client: makeGooglePlayClient(fixture.user.id, fixture.productId),
    })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({
      status: 'verified',
    })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toMatchObject({
      id: covering.id,
      plan: 'pro',
      status: 'active',
    })

    await updateMembershipFromEvent(
      { membershipId: covering.id, status: 'paused' },
      async () => false,
    )

    await expect(getMembershipByUserId(fixture.user.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
    })
  })

  it('does not restore a retained Google direct source when only its expiry has elapsed', async () => {
    const fixture = await createGooglePlayFixture()
    const coveringSku = await createTestSku({ plan: 'pro' })
    const covering = await createMembership({
      userId: fixture.user.id,
      plan: 'pro',
      skuId: coveringSku.id,
      stripeSubscriptionId: `sub_google_expired_retained_${randomUUID()}`,
    })
    const observation = await createTestUnprojectedProviderObservation({
      applicationId: fixture.applicationId,
      effectiveAt: new Date(Date.now() - 2 * 86_400_000),
      expiresAt: new Date(Date.now() - 60_000),
      membershipProductId: fixture.skuId,
      membershipProviderProductId: fixture.providerProductId,
      provider: 'google_play',
      sourceKind: 'direct',
      userId: fixture.user.id,
    })

    await expect(
      projectVerifiedProviderMembershipObservation({
        userId: fixture.user.id,
        membershipProviderObservationId: observation.membershipProviderObservationId,
        retainWhenDirectAdmissionRejected: true,
      }),
    ).resolves.toEqual({ membershipId: null, projected: false })

    await updateMembershipFromEvent(
      { membershipId: covering.id, status: 'paused' },
      async () => false,
    )

    await expect(getMembershipByUserId(fixture.user.id)).resolves.toMatchObject({
      id: covering.id,
      status: 'paused',
    })
  })
})

async function createGooglePlayFixture(): Promise<{
  applicationId: string
  productId: string
  providerProductId: string
  skuId: string
  user: Awaited<ReturnType<typeof createTestUser>>
}> {
  const user = await createTestUser()
  const applicationId = `ai.voucha.google-${randomUUID()}`
  const productId = `plus.monthly.${randomUUID()}`
  vi.stubEnv('ENVIRONMENT', 'staging')
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('GOOGLE_PLAY_APPLICATION_ID', applicationId)
  const sku = await createTestSku({ plan: 'plus' })
  const providerProduct = await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'google_play',
    environment: 'test',
    applicationId,
    providerProductId: productId,
  })
  return {
    applicationId,
    productId,
    providerProductId: providerProduct.id,
    skuId: sku.id,
    user,
  }
}

function makeGooglePlayClient(userId: string, productId: string): GooglePlaySubscriptionsV2Client {
  return {
    getSubscription: async () => ({
      latestOrderId: `synthetic-order-${randomUUID()}`,
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      testPurchase: {},
      externalAccountIdentifiers: {
        obfuscatedExternalAccountId: createHash('sha256').update(userId).digest('hex'),
      },
      lineItems: [
        {
          productId,
          expiryTime: new Date(Date.now() + 60 * 86_400_000).toISOString(),
        },
      ],
    }),
    acknowledgeSubscription: async () => undefined,
  }
}
