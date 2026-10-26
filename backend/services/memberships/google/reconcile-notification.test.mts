import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { createMembershipVerification } from '../verifications.mts'
import { getMembershipByUserId } from '../get.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { createTestGooglePlayRtdnEvidence } from '@voucha/test-helpers/google-play-memberships'
import {
  createTestGooglePlayClient,
  createTestGooglePlayRtdnBody,
  getTestPendingGooglePlayVerification,
} from '@voucha/test-helpers/google-play-recovery'
import { getTestMembershipProviderEvidenceTerminalState } from '@voucha/test-helpers/entities/memberships/provider-evidence'
import { reconcileGooglePlayRtdnNotification } from './reconcile-notification.mts'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import type { GooglePlaySubscriptionsV2Client } from './types.mts'

describe('Google Play RTDN reconciliation failures', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rejects ignored notifications but retries undecryptable evidence without provider access', async () => {
    const applicationId = configureGooglePlay()
    const ignoredEvidenceId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: createTestGooglePlayRtdnBody(applicationId, { testNotification: {} }),
    })
    const corruptedEvidenceId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: createTestGooglePlayRtdnBody(applicationId, {
        subscriptionNotification: {
          notificationType: 2,
          purchaseToken: `google-token-${randomUUID()}`,
          subscriptionId: `plus.monthly.${randomUUID()}`,
        },
      }),
      corruptEncryptedEvidence: true,
    })
    const client = unavailableClient()

    await reconcileGooglePlayRtdnNotification({ evidenceId: ignoredEvidenceId, client })
    await expect(
      reconcileGooglePlayRtdnNotification({ evidenceId: corruptedEvidenceId, client }),
    ).rejects.toThrow(/encrypted|secret|authenticate/i)

    await expect(
      getTestMembershipProviderEvidenceTerminalState(ignoredEvidenceId),
    ).resolves.toMatchObject({
      rejection_reason: 'invalid_google_rtdn',
    })
    await expect(
      getTestMembershipProviderEvidenceTerminalState(corruptedEvidenceId),
    ).resolves.toMatchObject({ rejected_at: null, rejection_reason: null })
  })

  it('retains an unbound notification and rejects a bound account mismatch', async () => {
    const applicationId = configureGooglePlay()
    const productId = `plus.monthly.${randomUUID()}`
    const unboundToken = `google-token-${randomUUID()}`
    const unboundEvidenceId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: createTestGooglePlayRtdnBody(applicationId, {
        subscriptionNotification: {
          notificationType: 2,
          purchaseToken: unboundToken,
          subscriptionId: productId,
        },
      }),
    })
    await reconcileGooglePlayRtdnNotification({
      evidenceId: unboundEvidenceId,
      client: createTestGooglePlayClient({ productId, userId: (await createTestUser()).id }),
    })
    await expect(
      getTestMembershipProviderEvidenceTerminalState(unboundEvidenceId),
    ).resolves.toMatchObject({
      rejected_at: null,
      observation_count: 0,
    })

    const owner = await createTestUser()
    const other = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: productId,
    })
    const boundToken = `google-token-${randomUUID()}`
    const verification = await createMembershipVerification({
      userId: owner.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: boundToken },
    })
    await expect(
      processGooglePlayMembershipVerification(verification.id, {
        client: createTestGooglePlayClient({ productId, userId: owner.id, pending: true }),
      }),
    ).rejects.toThrow('Google Play purchase is pending')
    const boundEvidenceId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: createTestGooglePlayRtdnBody(applicationId, {
        subscriptionNotification: {
          notificationType: 2,
          purchaseToken: boundToken,
          subscriptionId: productId,
        },
      }),
    })

    const mismatchClient = createTestGooglePlayClient({ productId, userId: other.id })
    const mismatchFetch = vi.spyOn(mismatchClient, 'getSubscription')
    await reconcileGooglePlayRtdnNotification({ evidenceId: boundEvidenceId })
    const recoveryVerificationId = await expectQueuedVerification(owner.id, applicationId)
    await processGooglePlayMembershipVerification(recoveryVerificationId, {
      client: mismatchClient,
    })
    await (await memberships.getJob(recoveryVerificationId))?.remove()
    expect(mismatchFetch).toHaveBeenCalledOnce()
    await reconcileGooglePlayRtdnNotification({ evidenceId: boundEvidenceId })
    expect(mismatchFetch).toHaveBeenCalledOnce()

    await expect(
      getTestMembershipProviderEvidenceTerminalState(boundEvidenceId),
    ).resolves.toMatchObject({
      rejection_reason: 'wrong_account',
    })
  })

  it('rejects a permanently invalid RTDN purchase token but retries a provider outage', async () => {
    const applicationId = configureGooglePlay()
    for (const status of [404, 503]) {
      const purchaseToken = `google-token-${randomUUID()}`
      const evidenceId = await createTestGooglePlayRtdnEvidence({
        applicationId,
        rawBody: createTestGooglePlayRtdnBody(applicationId, {
          subscriptionNotification: {
            notificationType: 2,
            purchaseToken,
            subscriptionId: `plus.monthly.${randomUUID()}`,
          },
        }),
      })
      const client: GooglePlaySubscriptionsV2Client = {
        getSubscription: async () => {
          throw new GooglePlaySubscriptionLookupError(status, purchaseToken)
        },
        acknowledgeSubscription: async () => undefined,
      }
      const failed = await reconcileGooglePlayRtdnNotification({ evidenceId, client }).then(
        () => false,
        () => true,
      )
      expect(failed).toBe(status === 503)
      await expect(
        getTestMembershipProviderEvidenceTerminalState(evidenceId),
      ).resolves.toMatchObject({
        rejection_reason: status === 404 ? 'invalid_evidence' : null,
      })
    }
  })

  it('rechecks the newest linked token when a delayed notification names an expired ancestor', async () => {
    const applicationId = configureGooglePlay()
    const owner = await createTestUser()
    const productId = `plus.monthly.${randomUUID()}`
    const oldToken = `google-token-${randomUUID()}`
    const newToken = `google-token-${randomUUID()}`
    const sku = await createTestSku({ plan: 'plus' })
    await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: productId,
    })
    const fetched: string[] = []
    let oldExpired = false
    const client: GooglePlaySubscriptionsV2Client = {
      getSubscription: async ({ purchaseToken }) => {
        fetched.push(purchaseToken)
        return {
          latestOrderId: `synthetic-order-${purchaseToken}`,
          linkedPurchaseToken: purchaseToken === newToken ? oldToken : undefined,
          subscriptionState:
            purchaseToken === oldToken && oldExpired
              ? 'SUBSCRIPTION_STATE_EXPIRED'
              : 'SUBSCRIPTION_STATE_ACTIVE',
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
          testPurchase: {},
          externalAccountIdentifiers: {
            obfuscatedExternalAccountId: createHash('sha256').update(owner.id).digest('hex'),
          },
          lineItems: [
            {
              productId,
              expiryTime: new Date(
                Date.now() + (purchaseToken === oldToken && oldExpired ? -1 : 60) * 86_400_000,
              ).toISOString(),
            },
          ],
        }
      },
      acknowledgeSubscription: async () => undefined,
    }
    for (const token of [oldToken, newToken]) {
      const verification = await createMembershipVerification({
        userId: owner.id,
        provider: 'google_play',
        purchaseIntentId: null,
        idempotencyKey: randomUUID(),
        evidence: { purchase_token: token },
      })
      await processGooglePlayMembershipVerification(verification.id, { client })
    }
    oldExpired = true
    fetched.length = 0
    const evidenceId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: createTestGooglePlayRtdnBody(applicationId, {
        subscriptionNotification: {
          notificationType: 13,
          purchaseToken: oldToken,
          subscriptionId: productId,
        },
      }),
    })
    await reconcileGooglePlayRtdnNotification({ evidenceId })
    const recoveryVerificationId = await expectQueuedVerification(owner.id, applicationId)
    await processGooglePlayMembershipVerification(recoveryVerificationId, { client })
    await (await memberships.getJob(recoveryVerificationId))?.remove()
    await reconcileGooglePlayRtdnNotification({ evidenceId })

    expect(fetched).toEqual([newToken])
    await expect(getMembershipByUserId(owner.id)).resolves.toMatchObject({
      plan: 'plus',
      status: 'active',
    })
  })
})

async function expectQueuedVerification(userId: string, applicationId: string): Promise<string> {
  const verificationId = await getTestPendingGooglePlayVerification({ userId, applicationId })
  if (!verificationId) throw new Error('Google Play RTDN verification was not admitted')
  await expect(memberships.getJob(verificationId)).resolves.toMatchObject({
    id: verificationId,
    name: 'processMembershipVerification',
    data: { verificationId },
  })
  return verificationId
}

function configureGooglePlay(): string {
  const applicationId = `ai.voucha.google-${randomUUID()}`
  vi.stubEnv('ENVIRONMENT', 'staging')
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('GOOGLE_PLAY_APPLICATION_ID', applicationId)
  return applicationId
}

function unavailableClient(): GooglePlaySubscriptionsV2Client {
  return {
    getSubscription: async () => {
      throw new Error('Provider access is not expected for invalid RTDN evidence')
    },
    acknowledgeSubscription: async () => undefined,
  }
}
