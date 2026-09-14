import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId, getMembershipSourceIdByMembershipId } from '@services/memberships'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import {
  countTestGooglePlayProviderObservations,
  getTestGooglePlayTokenLineageSummary,
} from '@voucha/test-helpers/google-play-memberships'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import { reconcileGooglePlayActiveSource } from './active-source-recovery.mts'
import type { GooglePlaySubscriptionV2, GooglePlaySubscriptionsV2Client } from './types.mts'

describe('Google Play membership verification and RTDN recovery', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('finalizes same-evidence replay for its owner and rejects cross-account replay', async () => {
    const owner = await createTestUser()
    const other = await createTestUser()
    const applicationId = `ai.voucha.google-${randomUUID()}`
    const productId = `plus.monthly.${randomUUID()}`
    const purchaseToken = `google-token-${randomUUID()}`
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
    const evidence = { purchase_token: purchaseToken }
    const expiryTime = new Date(Date.now() + 60 * 86_400_000).toISOString()
    let subscriptionState: GooglePlaySubscriptionV2['subscriptionState'] =
      'SUBSCRIPTION_STATE_ACTIVE'
    const client: GooglePlaySubscriptionsV2Client = {
      getSubscription: async () => ({
        latestOrderId: 'synthetic-order',
        subscriptionState,
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        testPurchase: {},
        externalAccountIdentifiers: {
          obfuscatedExternalAccountId: createHash('sha256').update(owner.id).digest('hex'),
        },
        lineItems: [{ productId, expiryTime }],
      }),
      acknowledgeSubscription: async () => undefined,
    }
    const submit = (userId: string) =>
      createMembershipVerification({
        userId,
        provider: 'google_play',
        purchaseIntentId: null,
        idempotencyKey: randomUUID(),
        evidence,
      })
    const first = await submit(owner.id)
    await processGooglePlayMembershipVerification(first.id, { client })
    const replay = await submit(owner.id)
    await processGooglePlayMembershipVerification(replay.id, { client })
    await expect(getMembershipVerification(owner.id, replay.id)).resolves.toMatchObject({
      status: 'verified',
    })
    const countObservations = () => countTestGooglePlayProviderObservations(first.id)
    expect(await countObservations()).toBe(1)
    subscriptionState = 'SUBSCRIPTION_STATE_ON_HOLD'
    const held = await submit(owner.id)
    await processGooglePlayMembershipVerification(held.id, { client })
    await expect(getMembershipByUserId(owner.id)).resolves.toMatchObject({ status: 'paused' })
    subscriptionState = 'SUBSCRIPTION_STATE_ACTIVE'
    const restored = await submit(owner.id)
    await processGooglePlayMembershipVerification(restored.id, { client })
    await expect(getMembershipByUserId(owner.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
    })
    expect(await countObservations()).toBe(3)

    const replacementToken = `google-replacement-${randomUUID()}`
    const replacementClient: GooglePlaySubscriptionsV2Client = {
      ...client,
      getSubscription: async ({ purchaseToken: fetchedToken }) => {
        expect(fetchedToken).toBe(replacementToken)
        return {
          ...(await client.getSubscription({
            packageName: applicationId,
            purchaseToken: fetchedToken,
          })),
          linkedPurchaseToken: purchaseToken,
        }
      },
    }
    const replacement = await createMembershipVerification({
      userId: owner.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: replacementToken },
    })
    await processGooglePlayMembershipVerification(replacement.id, { client: replacementClient })
    await expect(
      getTestGooglePlayTokenLineageSummary({
        firstPurchaseTokenLookupSha256: createHash('sha256').update(purchaseToken).digest('hex'),
        secondPurchaseTokenLookupSha256: createHash('sha256')
          .update(replacementToken)
          .digest('hex'),
      }),
    ).resolves.toEqual({ aliasCount: 2, lineageCount: 1 })
    expect(await countObservations()).toBe(3)

    const newestToken = `google-replacement-${randomUUID()}`
    const newestClient: GooglePlaySubscriptionsV2Client = {
      ...client,
      getSubscription: async ({ purchaseToken: fetchedToken }) => {
        expect(fetchedToken).toBe(newestToken)
        return {
          ...(await client.getSubscription({
            packageName: applicationId,
            purchaseToken: fetchedToken,
          })),
          linkedPurchaseToken: replacementToken,
        }
      },
    }
    const newest = await createMembershipVerification({
      userId: owner.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: newestToken },
    })
    await processGooglePlayMembershipVerification(newest.id, { client: newestClient })
    const membership = await getMembershipByUserId(owner.id)
    if (!membership) throw new Error('Google Play membership was not projected')
    const sourceId = await getMembershipSourceIdByMembershipId(membership.id)
    if (!sourceId) throw new Error('Google Play source was not projected')
    await reconcileGooglePlayActiveSource({ sourceId, client: newestClient })
    expect(await countObservations()).toBe(3)

    const wrongOwner = await submit(other.id)
    await processGooglePlayMembershipVerification(wrongOwner.id, { client })
    await expect(getMembershipVerification(other.id, wrongOwner.id)).resolves.toMatchObject({
      status: 'rejected',
      reason_code: 'wrong_account',
    })
    await expect(getMembershipByUserId(other.id)).resolves.toBeNull()
  })
})
