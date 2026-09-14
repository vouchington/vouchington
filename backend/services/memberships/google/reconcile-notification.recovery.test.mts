import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMembershipVerification } from '../verifications.mts'
import { getMembershipByUserId } from '../get.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { createTestGooglePlayRtdnEvidence } from '@voucha/test-helpers/google-play-memberships'
import { getTestMembershipProviderEvidenceTerminalState } from '@voucha/test-helpers/entities/memberships/provider-evidence'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import { reconcileGooglePlayRtdnNotification } from './reconcile-notification.mts'
import type { GooglePlaySubscriptionsV2Client } from './types.mts'

describe('Google Play RTDN recovery', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('defers a persisted unbound lineage without refetching and resumes after binding', async () => {
    const applicationId = configureGooglePlay()
    const user = await createTestUser()
    const productId = `plus.monthly.${randomUUID()}`
    const purchaseToken = `google-token-${randomUUID()}`
    await createGooglePlayProduct(applicationId, productId)
    const evidenceId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: rtdnBody(applicationId, purchaseToken, productId),
    })
    const calls: string[] = []
    const client = clientFor({ applicationId, productId, userId: user.id, calls })

    await reconcileGooglePlayRtdnNotification({ evidenceId, client })
    await expect(getTestMembershipProviderEvidenceTerminalState(evidenceId)).resolves.toMatchObject(
      {
        verified_at: null,
        rejected_at: null,
      },
    )
    await reconcileGooglePlayRtdnNotification({ evidenceId, client })
    expect(calls).toEqual([applicationId])

    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: purchaseToken },
    })
    await processGooglePlayMembershipVerification(verification.id, { client })
    calls.length = 0

    await reconcileGooglePlayRtdnNotification({ evidenceId, client })
    expect(calls).toEqual([applicationId])
    await expect(getTestMembershipProviderEvidenceTerminalState(evidenceId)).resolves.toMatchObject(
      {
        verified_at: expect.any(Date),
        rejected_at: null,
      },
    )
  })

  it('uses the RTDN persisted provider context after worker configuration changes', async () => {
    const applicationId = configureGooglePlay()
    const user = await createTestUser()
    const productId = `plus.monthly.${randomUUID()}`
    const purchaseToken = `google-token-${randomUUID()}`
    await createGooglePlayProduct(applicationId, productId)
    const client = clientFor({ applicationId, productId, userId: user.id, calls: [] })
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: purchaseToken },
    })
    await processGooglePlayMembershipVerification(verification.id, { client })
    const evidenceId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: rtdnBody(applicationId, purchaseToken, productId),
    })
    vi.stubEnv('GOOGLE_PLAY_APPLICATION_ID', `ai.voucha.changed-${randomUUID()}`)

    await reconcileGooglePlayRtdnNotification({ evidenceId, client })
    await expect(getTestMembershipProviderEvidenceTerminalState(evidenceId)).resolves.toMatchObject(
      {
        verified_at: expect.any(Date),
        rejected_at: null,
      },
    )
  })

  it('binds a signed-in successor when its permanently expired ancestor is unavailable', async () => {
    const applicationId = configureGooglePlay()
    const user = await createTestUser()
    const productId = `plus.monthly.${randomUUID()}`
    const currentToken = `google-current-${randomUUID()}`
    const ancestorToken = `google-ancestor-${randomUUID()}`
    await createGooglePlayProduct(applicationId, productId)
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: currentToken },
    })
    await processGooglePlayMembershipVerification(verification.id, {
      client: {
        getSubscription: async ({ purchaseToken }) => {
          if (purchaseToken === ancestorToken)
            throw new GooglePlaySubscriptionLookupError(400, ancestorToken, 'subscriptionExpired')
          expect(purchaseToken).toBe(currentToken)
          return subscriptionFor({ productId, userId: user.id, linkedPurchaseToken: ancestorToken })
        },
        acknowledgeSubscription: async () => undefined,
      },
    })
    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ status: 'active' })
  })
})

function configureGooglePlay(): string {
  const applicationId = `ai.voucha.google-${randomUUID()}`
  vi.stubEnv('ENVIRONMENT', 'staging')
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('GOOGLE_PLAY_APPLICATION_ID', applicationId)
  return applicationId
}

async function createGooglePlayProduct(applicationId: string, productId: string): Promise<void> {
  const sku = await createTestSku({ plan: 'plus' })
  await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'google_play',
    environment: 'test',
    applicationId,
    providerProductId: productId,
  })
}

function rtdnBody(applicationId: string, purchaseToken: string, productId: string): Buffer {
  return Buffer.from(
    JSON.stringify({
      message: {
        messageId: `test-rtdn-${randomUUID()}`,
        data: Buffer.from(
          JSON.stringify({
            packageName: applicationId,
            eventTimeMillis: String(Date.now()),
            subscriptionNotification: {
              notificationType: 2,
              purchaseToken,
              subscriptionId: productId,
            },
          }),
        ).toString('base64'),
      },
    }),
  )
}

function clientFor(options: {
  applicationId: string
  productId: string
  userId: string
  calls: string[]
}): GooglePlaySubscriptionsV2Client {
  return {
    getSubscription: async ({ packageName }) => {
      options.calls.push(packageName)
      expect(packageName).toBe(options.applicationId)
      return subscriptionFor({ productId: options.productId, userId: options.userId })
    },
    acknowledgeSubscription: async () => undefined,
  }
}

function subscriptionFor(options: {
  productId: string
  userId: string
  linkedPurchaseToken?: string
}) {
  return {
    latestOrderId: `synthetic-order-${randomUUID()}`,
    linkedPurchaseToken: options.linkedPurchaseToken,
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' as const,
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' as const,
    testPurchase: {},
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: createHash('sha256').update(options.userId).digest('hex'),
    },
    lineItems: [
      {
        productId: options.productId,
        expiryTime: new Date(Date.now() + 60 * 86_400_000).toISOString(),
      },
    ],
  }
}
