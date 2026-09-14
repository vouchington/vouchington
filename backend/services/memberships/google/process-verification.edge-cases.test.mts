import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId } from '@services/memberships'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import type { GooglePlaySubscriptionsV2Client } from './types.mts'

describe('Google Play membership verification edge cases', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rejects malformed encrypted purchase evidence without calling Google', async () => {
    const user = await createTestUser()
    configureGooglePlay(`ai.voucha.google-${randomUUID()}`)
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: '   ' },
    })
    let calls = 0

    await processGooglePlayMembershipVerification(verification.id, {
      client: {
        getSubscription: async () => {
          calls += 1
          throw new Error('Malformed evidence must be rejected before a provider call')
        },
        acknowledgeSubscription: async () => undefined,
      },
    })

    expect(calls).toBe(0)
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'rejected',
      reason_code: 'invalid_evidence',
    })
  })

  it('rejects an otherwise valid purchase when no configured Google product matches', async () => {
    const fixture = await createGooglePlayFixture()
    const verification = await fixture.submit(`google-token-${randomUUID()}`)

    await processGooglePlayMembershipVerification(verification.id, {
      client: makeGooglePlayClient({ userId: fixture.user.id, productId: `other-${randomUUID()}` }),
    })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'rejected', reason_code: 'wrong_product' })
  })

  it('binds a pending purchase without granting membership and leaves verification retryable', async () => {
    const fixture = await createGooglePlayFixture()
    const verification = await fixture.submit(`google-token-${randomUUID()}`)

    await processGooglePlayMembershipVerification(verification.id, {
      client: makeGooglePlayClient({
        userId: fixture.user.id,
        productId: fixture.productId,
        subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
      }),
    })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'pending', reason_code: null })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
  })

  it('rejects a matching purchase with a malformed authoritative expiry', async () => {
    const fixture = await createGooglePlayFixture()
    const verification = await fixture.submit(`google-token-${randomUUID()}`)

    await processGooglePlayMembershipVerification(verification.id, {
      client: makeGooglePlayClient({
        userId: fixture.user.id,
        productId: fixture.productId,
        expiryTime: 'not-a-timestamp',
      }),
    })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'rejected', reason_code: 'invalid_evidence' })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toBeNull()
  })

  it('releases a verification lease for a provider-fetch retry', async () => {
    const fixture = await createGooglePlayFixture()
    const verification = await fixture.submit(`google-token-${randomUUID()}`)
    let calls = 0

    await processGooglePlayMembershipVerification(verification.id, {
      client: {
        getSubscription: async () => {
          calls += 1
          throw new Error('Google subscriptionsv2 is temporarily unavailable')
        },
        acknowledgeSubscription: async () => undefined,
      },
    })

    expect(calls).toBe(1)
    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'pending', reason_code: null })
  })

  it('rejects an invalid purchase token without consuming retries for provider outages', async () => {
    const fixture = await createGooglePlayFixture()
    for (const status of [400, 404, 410]) {
      const purchaseToken = `google-invalid-${randomUUID()}`
      const verification = await fixture.submit(purchaseToken)
      await processGooglePlayMembershipVerification(verification.id, {
        client: {
          getSubscription: async () => {
            throw new GooglePlaySubscriptionLookupError(
              status,
              purchaseToken,
              status === 400 ? 'invalidValue' : null,
            )
          },
          acknowledgeSubscription: async () => undefined,
        },
      })
      await expect(
        getMembershipVerification(fixture.user.id, verification.id),
      ).resolves.toMatchObject({ status: 'rejected', reason_code: 'invalid_evidence' })
    }
    const purchaseToken = `google-retry-${randomUUID()}`
    const verification = await fixture.submit(purchaseToken)
    await processGooglePlayMembershipVerification(verification.id, {
      client: {
        getSubscription: async () => {
          throw new GooglePlaySubscriptionLookupError(503, purchaseToken)
        },
        acknowledgeSubscription: async () => undefined,
      },
    })
    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({ status: 'pending' })
    const ambiguousToken = `google-ambiguous-${randomUUID()}`
    const ambiguous = await fixture.submit(ambiguousToken)
    await processGooglePlayMembershipVerification(ambiguous.id, {
      client: {
        getSubscription: async () => {
          throw new GooglePlaySubscriptionLookupError(400, ambiguousToken, 'required')
        },
        acknowledgeSubscription: async () => undefined,
      },
    })
    await expect(getMembershipVerification(fixture.user.id, ambiguous.id)).resolves.toMatchObject({
      status: 'pending',
    })
  })

  it('terminalizes a lineage already bound to another user as a conflict', async () => {
    const fixture = await createGooglePlayFixture()
    const other = await createTestUser()
    const purchaseToken = `google-token-${randomUUID()}`
    const first = await fixture.submit(purchaseToken)

    await processGooglePlayMembershipVerification(first.id, {
      client: makeGooglePlayClient({ userId: fixture.user.id, productId: fixture.productId }),
    })

    const conflicting = await createMembershipVerification({
      userId: other.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: purchaseToken },
    })
    await processGooglePlayMembershipVerification(conflicting.id, {
      client: makeGooglePlayClient({ userId: other.id, productId: fixture.productId }),
    })

    await expect(getMembershipVerification(other.id, conflicting.id)).resolves.toMatchObject({
      status: 'conflict',
      reason_code: 'wrong_account',
    })
    await expect(getMembershipByUserId(other.id)).resolves.toBeNull()
  })

  it('grants a verified current purchase when its linked predecessor is gone', async () => {
    const fixture = await createGooglePlayFixture()
    const currentToken = `google-current-${randomUUID()}`
    const priorToken = `google-prior-${randomUUID()}`
    const verification = await fixture.submit(currentToken)
    const currentClient = makeGooglePlayClient({
      userId: fixture.user.id,
      productId: fixture.productId,
      linkedPurchaseToken: priorToken,
    })
    await processGooglePlayMembershipVerification(verification.id, {
      client: {
        ...currentClient,
        getSubscription: async request => {
          if (request.purchaseToken === priorToken)
            throw new GooglePlaySubscriptionLookupError(410, priorToken)
          return currentClient.getSubscription(request)
        },
      },
    })

    await expect(
      getMembershipVerification(fixture.user.id, verification.id),
    ).resolves.toMatchObject({
      status: 'verified',
    })
    await expect(getMembershipByUserId(fixture.user.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
    })
  })
})

async function createGooglePlayFixture(): Promise<{
  productId: string
  submit(purchaseToken: string): ReturnType<typeof createMembershipVerification>
  user: Awaited<ReturnType<typeof createTestUser>>
}> {
  const user = await createTestUser()
  const applicationId = `ai.voucha.google-${randomUUID()}`
  const productId = `plus.monthly.${randomUUID()}`
  configureGooglePlay(applicationId)
  const sku = await createTestSku({ plan: 'plus' })
  await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'google_play',
    environment: 'test',
    applicationId,
    providerProductId: productId,
  })
  return {
    productId,
    user,
    submit(purchaseToken) {
      return createMembershipVerification({
        userId: user.id,
        provider: 'google_play',
        purchaseIntentId: null,
        idempotencyKey: randomUUID(),
        evidence: { purchase_token: purchaseToken },
      })
    },
  }
}

function configureGooglePlay(applicationId: string): void {
  vi.stubEnv('ENVIRONMENT', 'staging')
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('GOOGLE_PLAY_APPLICATION_ID', applicationId)
}

function makeGooglePlayClient(options: {
  userId: string
  productId: string
  linkedPurchaseToken?: string
  subscriptionState?: 'SUBSCRIPTION_STATE_ACTIVE' | 'SUBSCRIPTION_STATE_PENDING'
  expiryTime?: string
}): GooglePlaySubscriptionsV2Client {
  return {
    getSubscription: async () => ({
      latestOrderId: `synthetic-order-${randomUUID()}`,
      linkedPurchaseToken: options.linkedPurchaseToken,
      subscriptionState: options.subscriptionState ?? 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      testPurchase: {},
      externalAccountIdentifiers: {
        obfuscatedExternalAccountId: createHash('sha256').update(options.userId).digest('hex'),
      },
      lineItems: [
        {
          productId: options.productId,
          expiryTime: options.expiryTime ?? new Date(Date.now() + 60 * 86_400_000).toISOString(),
        },
      ],
    }),
    acknowledgeSubscription: async () => undefined,
  }
}
