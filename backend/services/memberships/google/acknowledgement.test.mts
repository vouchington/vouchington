import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMembershipVerification } from '../verifications.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import {
  getTestGooglePlayAcknowledgementId,
  getTestGooglePlayAcknowledgementRecoveryCursor,
  makeTestGooglePlayAcknowledgementDue,
} from '@voucha/test-helpers/google-play-memberships'
import {
  acknowledgeGooglePlayPurchase,
  advanceGooglePlayAcknowledgementRecoveryCursor,
  findDueGooglePlayAcknowledgementIds,
} from './acknowledgement.mts'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import type { GooglePlaySubscriptionV2, GooglePlaySubscriptionsV2Client } from './types.mts'

describe('Google Play acknowledgement recovery', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('does not advance the recovery cursor for an empty batch', async () => {
    await expect(
      advanceGooglePlayAcknowledgementRecoveryCursor({
        acknowledgementIds: [],
        previousCursor: null,
        previousUpperBound: null,
        sweepUpperBound: null,
        nextCursor: null,
        completesSweep: false,
      }),
    ).resolves.toBeUndefined()
  })

  it('defers acknowledgement when the claimed work no longer exists', async () => {
    const client: GooglePlaySubscriptionsV2Client = {
      getSubscription: async () => {
        throw new Error('No Google call is expected without a claim')
      },
      acknowledgeSubscription: async () => {
        throw new Error('No Google call is expected without a claim')
      },
    }
    await expect(
      acknowledgeGooglePlayPurchase({ acknowledgementId: randomUUID(), client }),
    ).resolves.toBe('deferred')
  })

  it('recovers an acknowledgement reply loss without a duplicate Play mutation', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.google-${randomUUID()}`
    const productId = `plus.monthly.${randomUUID()}`
    const purchaseToken = `google-token-${randomUUID()}`
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('GOOGLE_PLAY_APPLICATION_ID', applicationId)
    const sku = await createTestSku({ plan: 'plus' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: productId,
    })
    let acknowledgedByPlay = false
    let subscriptionState: GooglePlaySubscriptionV2['subscriptionState'] =
      'SUBSCRIPTION_STATE_ACTIVE'
    let acknowledgementCalls = 0
    const client: GooglePlaySubscriptionsV2Client = {
      getSubscription: async () => ({
        latestOrderId: 'synthetic-order',
        subscriptionState,
        acknowledgementState: acknowledgedByPlay
          ? 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
          : 'ACKNOWLEDGEMENT_STATE_PENDING',
        testPurchase: {},
        externalAccountIdentifiers: {
          obfuscatedExternalAccountId: createHash('sha256').update(user.id).digest('hex'),
        },
        lineItems: [
          { productId, expiryTime: new Date(Date.now() + 60 * 86_400_000).toISOString() },
        ],
      }),
      acknowledgeSubscription: async () => {
        acknowledgementCalls++
        acknowledgedByPlay = true
        throw new Error('Simulated lost acknowledgement response')
      },
    }
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: purchaseToken },
    })
    await processGooglePlayMembershipVerification(verification.id, { client })
    const acknowledgementId = await getTestGooglePlayAcknowledgementId(verification.id)
    if (!acknowledgementId) throw new Error('Google Play acknowledgement was not created')
    const dueBatch = await findDueGooglePlayAcknowledgementIds()
    expect(dueBatch.acknowledgementIds).toContain(acknowledgementId)
    await advanceGooglePlayAcknowledgementRecoveryCursor(dueBatch)
    expect(dueBatch.completesSweep).toBe(true)
    expect(await getTestGooglePlayAcknowledgementRecoveryCursor()).toBeNull()
    subscriptionState = 'SUBSCRIPTION_STATE_ON_HOLD'
    expect(await acknowledgeGooglePlayPurchase({ acknowledgementId, client })).toBe('skipped')
    expect(acknowledgementCalls).toBe(0)
    subscriptionState = 'SUBSCRIPTION_STATE_ACTIVE'
    const restored = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: purchaseToken },
    })
    await processGooglePlayMembershipVerification(restored.id, { client })
    expect(await acknowledgeGooglePlayPurchase({ acknowledgementId, client })).toBe('deferred')
    await makeTestGooglePlayAcknowledgementDue(acknowledgementId)
    expect(await acknowledgeGooglePlayPurchase({ acknowledgementId, client })).toBe('acknowledged')
    expect(acknowledgementCalls).toBe(1)
  })

  it('stops retrying acknowledgement when Play permanently rejects the purchase token', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.google-${randomUUID()}`
    const productId = `plus.monthly.${randomUUID()}`
    const purchaseToken = `google-token-${randomUUID()}`
    vi.stubEnv('ENVIRONMENT', 'staging')
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
      evidence: { purchase_token: purchaseToken },
    })
    await processGooglePlayMembershipVerification(verification.id, {
      client: {
        getSubscription: async () => ({
          latestOrderId: 'synthetic-order',
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
          testPurchase: {},
          externalAccountIdentifiers: {
            obfuscatedExternalAccountId: createHash('sha256').update(user.id).digest('hex'),
          },
          lineItems: [
            { productId, expiryTime: new Date(Date.now() + 60 * 86_400_000).toISOString() },
          ],
        }),
        acknowledgeSubscription: async () => undefined,
      },
    })
    const acknowledgementId = await getTestGooglePlayAcknowledgementId(verification.id)
    if (!acknowledgementId) throw new Error('Google Play acknowledgement was not created')
    const invalidClient: GooglePlaySubscriptionsV2Client = {
      getSubscription: async () => {
        throw new GooglePlaySubscriptionLookupError(410, purchaseToken)
      },
      acknowledgeSubscription: async () => {
        throw new Error('Invalid Play purchase must not be acknowledged')
      },
    }
    expect(await acknowledgeGooglePlayPurchase({ acknowledgementId, client: invalidClient })).toBe(
      'skipped',
    )
    expect(await acknowledgeGooglePlayPurchase({ acknowledgementId, client: invalidClient })).toBe(
      'deferred',
    )
  })
})
