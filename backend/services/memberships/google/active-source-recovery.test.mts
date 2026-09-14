import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMembershipVerification,
  getMembershipByUserId,
  getMembershipSourceIdByMembershipId,
} from '@services/memberships'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  getTestMembershipSourceState,
} from '@voucha/test-helpers'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import {
  advanceGooglePlayActiveSourceRecoveryCursor,
  findRecoverableGooglePlayActiveSourceJobs,
  reconcileGooglePlayActiveSource,
} from './active-source-recovery.mts'
import type { GooglePlaySubscriptionV2, GooglePlaySubscriptionsV2Client } from './types.mts'

describe('Google Play active-source recovery', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('finds an active source and advances its cursor with compare-and-swap semantics', async () => {
    const fixture = await createActiveGooglePlayFixture()
    const sourceId = await getMembershipSourceIdByMembershipId(fixture.membershipId)
    if (!sourceId) throw new Error('Google Play source was not projected')

    const batch = await findRecoverableGooglePlayActiveSourceJobs()
    expect(batch.sourceIds).toContain(sourceId)
    expect(batch.nextCursor).toBeTruthy()
    expect(batch.completesSweep).toBe(true)

    await advanceGooglePlayActiveSourceRecoveryCursor(batch)
    const afterAdvance = await findRecoverableGooglePlayActiveSourceJobs()
    expect(afterAdvance.previousCursor).toBeNull()

    await advanceGooglePlayActiveSourceRecoveryCursor({
      ...batch,
      nextCursor: randomUUID(),
    })
    await expect(findRecoverableGooglePlayActiveSourceJobs()).resolves.toMatchObject({
      previousCursor: null,
    })
  })

  it('revalidates and decrypts the latest token before converging a missed expiry', async () => {
    const fixture = await createActiveGooglePlayFixture()
    const fetchedTokens: string[] = []
    const expiredAt = new Date(Date.now() - 60_000).toISOString()
    const client: GooglePlaySubscriptionsV2Client = {
      getSubscription: async ({ purchaseToken }) => {
        fetchedTokens.push(purchaseToken)
        return subscriptionFixture(fixture.userId, fixture.productId, {
          subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
          expiryTime: expiredAt,
        })
      },
      acknowledgeSubscription: async () => undefined,
    }

    await reconcileGooglePlayActiveSource({ sourceId: fixture.sourceId, client })

    expect(fetchedTokens).toEqual([fixture.purchaseToken])
    await expect(getTestMembershipRaw(fixture.membershipId)).resolves.toMatchObject({
      status: 'expired',
    })
    await expect(getTestMembershipSourceState(fixture.membershipId)).resolves.toMatchObject({
      expired_at: expect.any(Date),
    })
    await expect(getMembershipByUserId(fixture.userId)).resolves.toBeNull()
  })

  it.each([
    { status: 404, reason: null },
    { status: 410, reason: null },
    { status: 400, reason: 'subscriptionExpired' },
  ])(
    'terminalizes a known source after permanent leaf lookup loss ($status $reason)',
    async ({ status, reason }) => {
      const fixture = await createActiveGooglePlayFixture()
      await reconcileGooglePlayActiveSource({
        sourceId: fixture.sourceId,
        client: {
          getSubscription: async ({ purchaseToken }) => {
            throw new GooglePlaySubscriptionLookupError(status, purchaseToken, reason)
          },
          acknowledgeSubscription: async () => undefined,
        },
      })

      await expect(getTestMembershipSourceState(fixture.membershipId)).resolves.toMatchObject({
        expired_at: expect.any(Date),
      })
      await expect(getMembershipByUserId(fixture.userId)).resolves.toBeNull()
    },
  )

  it('lets an in-flight successor supersede a terminalized predecessor', async () => {
    const fixture = await createActiveGooglePlayFixture()
    const successorToken = `google-successor-${randomUUID()}`
    const successorStarted = Promise.withResolvers<void>()
    const releaseSuccessor = Promise.withResolvers<void>()
    const successor = await createMembershipVerification({
      userId: fixture.userId,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: successorToken },
    })
    const successorProcessing = processGooglePlayMembershipVerification(successor.id, {
      client: {
        getSubscription: async ({ purchaseToken }) => {
          expect(purchaseToken).toBe(successorToken)
          successorStarted.resolve()
          await releaseSuccessor.promise
          return subscriptionFixture(fixture.userId, fixture.productId, {
            linkedPurchaseToken: fixture.purchaseToken,
          })
        },
        acknowledgeSubscription: async () => undefined,
      },
    })
    await successorStarted.promise

    await reconcileGooglePlayActiveSource({
      sourceId: fixture.sourceId,
      client: {
        getSubscription: async ({ purchaseToken }) => {
          throw new GooglePlaySubscriptionLookupError(404, purchaseToken)
        },
        acknowledgeSubscription: async () => undefined,
      },
    })
    releaseSuccessor.resolve()
    await successorProcessing

    await expect(getMembershipByUserId(fixture.userId)).resolves.toMatchObject({ status: 'active' })
    await expect(getTestMembershipSourceState(fixture.membershipId)).resolves.toMatchObject({
      expired_at: null,
    })
  })

  it('does not let a different user terminalize a known source through a missing token', async () => {
    const fixture = await createActiveGooglePlayFixture()
    const other = await createTestUser()
    const verification = await createMembershipVerification({
      userId: other.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: fixture.purchaseToken },
    })
    await processGooglePlayMembershipVerification(verification.id, {
      client: {
        getSubscription: async ({ purchaseToken }) => {
          throw new GooglePlaySubscriptionLookupError(404, purchaseToken)
        },
        acknowledgeSubscription: async () => undefined,
      },
    })

    await expect(getMembershipByUserId(fixture.userId)).resolves.toMatchObject({ status: 'active' })
    await expect(getMembershipByUserId(other.id)).resolves.toBeNull()
  })
})

async function createActiveGooglePlayFixture() {
  const user = await createTestUser()
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
  const client: GooglePlaySubscriptionsV2Client = {
    getSubscription: async ({ purchaseToken: fetchedToken }) => {
      if (fetchedToken !== purchaseToken) throw new Error('Unexpected Google Play token')
      return subscriptionFixture(user.id, productId)
    },
    acknowledgeSubscription: async () => undefined,
  }
  const verification = await createMembershipVerification({
    userId: user.id,
    provider: 'google_play',
    purchaseIntentId: null,
    idempotencyKey: randomUUID(),
    evidence: { purchase_token: purchaseToken },
  })
  await processGooglePlayMembershipVerification(verification.id, { client })
  const membership = await getMembershipByUserId(user.id)
  if (!membership) throw new Error('Google Play fixture was not projected')
  const sourceId = await getMembershipSourceIdByMembershipId(membership.id)
  if (!sourceId) throw new Error('Google Play fixture source was not projected')
  return {
    userId: user.id,
    applicationId,
    productId,
    purchaseToken,
    membershipId: membership.id,
    sourceId,
  }
}

function subscriptionFixture(
  userId: string,
  productId: string,
  options: {
    subscriptionState?: GooglePlaySubscriptionV2['subscriptionState']
    expiryTime?: string
    linkedPurchaseToken?: string
  } = {},
): GooglePlaySubscriptionV2 {
  return {
    latestOrderId: 'synthetic-order',
    subscriptionState: options.subscriptionState ?? 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    linkedPurchaseToken: options.linkedPurchaseToken,
    testPurchase: {},
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: createHash('sha256').update(userId).digest('hex'),
    },
    lineItems: [
      {
        productId,
        expiryTime: options.expiryTime ?? new Date(Date.now() + 60 * 86_400_000).toISOString(),
      },
    ],
  }
}
