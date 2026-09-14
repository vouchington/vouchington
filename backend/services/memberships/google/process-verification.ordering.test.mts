import { createHash, randomUUID } from 'node:crypto'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { getTestGooglePlaySourceExpiredAt } from '@voucha/test-helpers/google-play-verification-state'
import { createMembershipVerification, getMembershipByUserId } from '@services/memberships'
import { describe, expect, it } from 'vitest'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import type { GooglePlaySubscriptionV2 } from './types.mts'

describe('Google Play observation ordering', () => {
  it('does not revive an expired source when an older fetch of a previously unknown token returns last', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.ordering-${randomUUID()}`
    const productId = `plus.monthly.${randomUUID()}`
    const purchaseToken = `google-token-${randomUUID()}`
    const sku = await createTestSku({ plan: 'plus' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: productId,
    })
    const createVerification = () =>
      createMembershipVerification({
        userId: user.id,
        provider: 'google_play',
        purchaseIntentId: null,
        idempotencyKey: randomUUID(),
        trustedProviderContext: { environment: 'test', applicationId },
        evidence: { purchase_token: purchaseToken },
      })
    const first = await createVerification()
    const second = await createVerification()
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const subscription = (
      subscriptionState: GooglePlaySubscriptionV2['subscriptionState'],
      expiryTime: string,
    ): GooglePlaySubscriptionV2 => ({
      latestOrderId: 'synthetic-order',
      subscriptionState,
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      testPurchase: {},
      externalAccountIdentifiers: {
        obfuscatedExternalAccountId: createHash('sha256').update(user.id).digest('hex'),
      },
      lineItems: [{ productId, expiryTime }],
    })
    const olderFetch = processGooglePlayMembershipVerification(first.id, {
      client: {
        getSubscription: async () => {
          started.resolve()
          await release.promise
          return subscription(
            'SUBSCRIPTION_STATE_ACTIVE',
            new Date(Date.now() + 86_400_000).toISOString(),
          )
        },
        acknowledgeSubscription: async () => undefined,
      },
    })
    await started.promise
    await processGooglePlayMembershipVerification(second.id, {
      client: {
        getSubscription: async () =>
          subscription('SUBSCRIPTION_STATE_EXPIRED', new Date(Date.now() - 60_000).toISOString()),
        acknowledgeSubscription: async () => undefined,
      },
    })
    release.resolve()
    await olderFetch

    await expect(getMembershipByUserId(user.id)).resolves.toBeNull()
    await expect(getTestGooglePlaySourceExpiredAt(user.id)).resolves.toBeInstanceOf(Date)
  })

  it('does not let an older permanent lookup failure expire a newer successful fetch', async () => {
    const fixture = await createActiveFixture()
    const older = await fixture.createVerification(fixture.purchaseToken)
    const newer = await fixture.createVerification(fixture.purchaseToken)
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const olderFetch = processGooglePlayMembershipVerification(older.id, {
      client: {
        getSubscription: async ({ purchaseToken }) => {
          started.resolve()
          await release.promise
          throw new GooglePlaySubscriptionLookupError(404, purchaseToken)
        },
        acknowledgeSubscription: async () => undefined,
      },
    })
    await started.promise
    await processGooglePlayMembershipVerification(newer.id, {
      client: {
        getSubscription: async () =>
          fixture.subscription(
            'SUBSCRIPTION_STATE_ACTIVE',
            new Date(Date.now() + 2 * 86_400_000).toISOString(),
            null,
            'synthetic-newer',
          ),
        acknowledgeSubscription: async () => undefined,
      },
    })
    release.resolve()
    await olderFetch

    await expect(getMembershipByUserId(fixture.userId)).resolves.toMatchObject({
      status: 'active',
    })
    await expect(getTestGooglePlaySourceExpiredAt(fixture.userId)).resolves.toBeNull()
  })

  it('does not rebase an older sibling successor beyond a newer expired sibling', async () => {
    const fixture = await createActiveFixture()
    const olderToken = `google-older-successor-${randomUUID()}`
    const newerToken = `google-newer-successor-${randomUUID()}`
    const older = await fixture.createVerification(olderToken)
    const newer = await fixture.createVerification(newerToken)
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const olderFetch = processGooglePlayMembershipVerification(older.id, {
      client: {
        getSubscription: async ({ purchaseToken }) => {
          expect(purchaseToken).toBe(olderToken)
          started.resolve()
          await release.promise
          return fixture.subscription(
            'SUBSCRIPTION_STATE_ACTIVE',
            new Date(Date.now() + 86_400_000).toISOString(),
            fixture.purchaseToken,
            'synthetic-older-successor',
          )
        },
        acknowledgeSubscription: async () => undefined,
      },
    })
    await started.promise
    await processGooglePlayMembershipVerification(newer.id, {
      client: {
        getSubscription: async ({ purchaseToken }) => {
          expect(purchaseToken).toBe(newerToken)
          return fixture.subscription(
            'SUBSCRIPTION_STATE_EXPIRED',
            new Date(Date.now() - 60_000).toISOString(),
            fixture.purchaseToken,
            'synthetic-newer-successor',
          )
        },
        acknowledgeSubscription: async () => undefined,
      },
    })
    release.resolve()
    await olderFetch

    await expect(getMembershipByUserId(fixture.userId)).resolves.toBeNull()
    await expect(getTestGooglePlaySourceExpiredAt(fixture.userId)).resolves.toBeInstanceOf(Date)
  })
})

async function createActiveFixture() {
  const user = await createTestUser()
  const applicationId = `ai.voucha.ordering-${randomUUID()}`
  const productId = `plus.monthly.${randomUUID()}`
  const purchaseToken = `google-token-${randomUUID()}`
  const sku = await createTestSku({ plan: 'plus' })
  await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'google_play',
    environment: 'test',
    applicationId,
    providerProductId: productId,
  })
  const createVerification = (token: string) =>
    createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      trustedProviderContext: { environment: 'test', applicationId },
      evidence: { purchase_token: token },
    })
  const subscription = (
    state: GooglePlaySubscriptionV2['subscriptionState'],
    expiryTime: string,
    linkedPurchaseToken: string | null,
    latestOrderId: string,
  ): GooglePlaySubscriptionV2 => ({
    latestOrderId,
    subscriptionState: state,
    linkedPurchaseToken: linkedPurchaseToken ?? undefined,
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    testPurchase: {},
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: createHash('sha256').update(user.id).digest('hex'),
    },
    lineItems: [{ productId, expiryTime }],
  })
  const seed = await createVerification(purchaseToken)
  await processGooglePlayMembershipVerification(seed.id, {
    client: {
      getSubscription: async () =>
        subscription(
          'SUBSCRIPTION_STATE_ACTIVE',
          new Date(Date.now() + 86_400_000).toISOString(),
          null,
          'synthetic-seed',
        ),
      acknowledgeSubscription: async () => undefined,
    },
  })
  return { userId: user.id, purchaseToken, createVerification, subscription }
}
