import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId } from '@services/memberships'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { reacceptTestGooglePlayVerifiedEvidence } from '@voucha/test-helpers/google-play-memberships'
import { createTestMalformedGooglePlayMembershipVerification } from '@voucha/test-helpers/google-play-memberships-persistence'
import { GooglePlayLineageConflictError } from './lineage.mts'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import type { GooglePlaySubscriptionsV2Client } from './types.mts'

describe('Google Play verification persistence', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('returns the original verified observation and rejects changed bindings', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.google-${randomUUID()}`
    const productId = `plus.monthly.${randomUUID()}`
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GOOGLE_PLAY_APPLICATION_ID', applicationId)
    const sku = await createTestSku({ plan: 'plus' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: productId,
    })
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: `google-token-${randomUUID()}` },
    })
    await processGooglePlayMembershipVerification(verification.id, {
      client: makeClient({ productId, userId: user.id }),
    })

    await expect(
      reacceptTestGooglePlayVerifiedEvidence({ verificationId: verification.id }),
    ).resolves.toMatch(/^[0-9a-f-]{36}$/)
    await expect(
      reacceptTestGooglePlayVerifiedEvidence({
        verificationId: verification.id,
        lineageId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(GooglePlayLineageConflictError)
    await expect(
      reacceptTestGooglePlayVerifiedEvidence({
        verificationId: verification.id,
        membershipProviderProductId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(GooglePlayLineageConflictError)
  })

  it('rejects immutable evidence whose decrypted plaintext is malformed', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.google-${randomUUID()}`
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GOOGLE_PLAY_APPLICATION_ID', applicationId)
    const verificationId = await createTestMalformedGooglePlayMembershipVerification({
      applicationId,
      userId: user.id,
    })

    await processGooglePlayMembershipVerification(verificationId, { client: unavailableClient() })

    await expect(getMembershipVerification(user.id, verificationId)).resolves.toMatchObject({
      status: 'rejected',
      reason_code: 'invalid_evidence',
    })
  })

  it('defers retry when encrypted evidence cannot be decrypted from configured secrets', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.google-${randomUUID()}`
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      trustedProviderContext: { environment: 'test', applicationId },
      evidence: { purchase_token: `google-token-${randomUUID()}` },
    })
    vi.stubEnv('VOUCHA_STORED_SECRET_ENCRYPTION_KEYS', undefined)
    let providerCalls = 0

    await processGooglePlayMembershipVerification(verification.id, {
      client: {
        getSubscription: async () => {
          providerCalls += 1
          throw new Error('Decryption must fail before Google is called')
        },
        acknowledgeSubscription: async () => undefined,
      },
    })

    expect(providerCalls).toBe(0)
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'pending',
      reason_code: null,
    })
  })

  it('selects the configured base plan and offer from an otherwise shared Play product', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.google-${randomUUID()}`
    const productId = `plus.${randomUUID()}`
    configureGooglePlay(applicationId)
    const [monthly, annual] = await Promise.all([
      createTestSku({ plan: 'plus', interval: 'monthly' }),
      createTestSku({ plan: 'pro', interval: 'yearly' }),
    ])
    await Promise.all([
      createTestNativeMembershipProviderProduct({
        membershipProductId: monthly.id,
        provider: 'google_play',
        environment: 'test',
        applicationId,
        providerProductId: productId,
        basePlanId: 'monthly',
      }),
      createTestNativeMembershipProviderProduct({
        membershipProductId: annual.id,
        provider: 'google_play',
        environment: 'test',
        applicationId,
        providerProductId: productId,
        basePlanId: 'annual',
        offerId: 'intro',
      }),
    ])
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      trustedProviderContext: { environment: 'test', applicationId },
      evidence: { purchase_token: `google-token-${randomUUID()}` },
    })

    await processGooglePlayMembershipVerification(verification.id, {
      client: makeClient({
        productId,
        userId: user.id,
        basePlanId: 'annual',
        offerId: 'intro',
      }),
    })

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ plan: 'pro' })
  })

  it('preserves the first effective time when a later provider revision omits startTime', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.google-${randomUUID()}`
    const productId = `plus.${randomUUID()}`
    configureGooglePlay(applicationId)
    const sku = await createTestSku({ plan: 'plus' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: productId,
    })
    const purchaseToken = `google-token-${randomUUID()}`
    const first = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      trustedProviderContext: { environment: 'test', applicationId },
      evidence: { purchase_token: purchaseToken },
    })
    await processGooglePlayMembershipVerification(first.id, {
      client: makeClient({ productId, userId: user.id, orderId: 'GPA.first' }),
    })
    const initial = await getMembershipByUserId(user.id)
    if (!initial) throw new Error('Expected initial Google Play membership')
    const next = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      trustedProviderContext: { environment: 'test', applicationId },
      evidence: { purchase_token: purchaseToken },
    })
    await processGooglePlayMembershipVerification(next.id, {
      client: makeClient({ productId, userId: user.id, orderId: 'GPA.renewed' }),
    })

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      started_at: initial.started_at,
    })
  })
})

function makeClient(options: {
  productId: string
  userId: string
  basePlanId?: string
  offerId?: string
  orderId?: string
}): GooglePlaySubscriptionsV2Client {
  return {
    getSubscription: async () => ({
      latestOrderId: options.orderId ?? `synthetic-order-${randomUUID()}`,
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      testPurchase: {},
      externalAccountIdentifiers: {
        obfuscatedExternalAccountId: createHash('sha256').update(options.userId).digest('hex'),
      },
      lineItems: [
        {
          productId: options.productId,
          expiryTime: new Date(Date.now() + 60 * 86_400_000).toISOString(),
          offerDetails:
            options.basePlanId || options.offerId
              ? { basePlanId: options.basePlanId, offerId: options.offerId }
              : undefined,
        },
      ],
    }),
    acknowledgeSubscription: async () => undefined,
  }
}

function configureGooglePlay(applicationId: string): void {
  vi.stubEnv('ENVIRONMENT', 'staging')
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('GOOGLE_PLAY_APPLICATION_ID', applicationId)
}

function unavailableClient(): GooglePlaySubscriptionsV2Client {
  return {
    getSubscription: async () => {
      throw new Error('Provider access is not expected for corrupt evidence')
    },
    acknowledgeSubscription: async () => undefined,
  }
}
