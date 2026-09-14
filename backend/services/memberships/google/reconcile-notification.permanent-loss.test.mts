import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId } from '../get.mts'
import { createMembershipVerification } from '../verifications.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
  getTestMembershipSourceState,
} from '@voucha/test-helpers'
import { createTestGooglePlayRtdnEvidence } from '@voucha/test-helpers/google-play-memberships'
import { getTestMembershipProviderEvidenceTerminalState } from '@voucha/test-helpers/entities/memberships/provider-evidence'
import { GooglePlaySubscriptionLookupError } from './configured-client.mts'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import { reconcileGooglePlayRtdnNotification } from './reconcile-notification.mts'

describe('Google Play bound RTDN permanent lookup loss', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rechecks the current token when a delayed RTDN names an unavailable predecessor', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.google-${randomUUID()}`
    const productId = `plus.monthly.${randomUUID()}`
    const currentToken = `google-current-${randomUUID()}`
    const predecessorToken = `google-predecessor-${randomUUID()}`
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
    const fetched: string[] = []
    const client = {
      getSubscription: async ({ purchaseToken }: { purchaseToken: string }) => {
        fetched.push(purchaseToken)
        if (purchaseToken === predecessorToken)
          throw new GooglePlaySubscriptionLookupError(410, predecessorToken)
        if (purchaseToken !== currentToken) throw new Error('Unexpected Google Play token')
        return {
          latestOrderId: `synthetic-order-${currentToken}`,
          linkedPurchaseToken: predecessorToken,
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' as const,
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' as const,
          testPurchase: {},
          externalAccountIdentifiers: {
            obfuscatedExternalAccountId: createHash('sha256').update(user.id).digest('hex'),
          },
          lineItems: [
            { productId, expiryTime: new Date(Date.now() + 60 * 86_400_000).toISOString() },
          ],
        }
      },
      acknowledgeSubscription: async () => undefined,
    }
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: currentToken },
    })
    await processGooglePlayMembershipVerification(verification.id, { client })
    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ status: 'active' })
    expect(fetched).toEqual([currentToken, predecessorToken])
    fetched.length = 0
    const evidenceId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: Buffer.from(
        JSON.stringify({
          message: {
            messageId: `test-rtdn-${randomUUID()}`,
            data: Buffer.from(
              JSON.stringify({
                packageName: applicationId,
                eventTimeMillis: String(Date.now()),
                subscriptionNotification: {
                  notificationType: 2,
                  purchaseToken: predecessorToken,
                  subscriptionId: productId,
                },
              }),
            ).toString('base64'),
          },
        }),
      ),
    })

    await reconcileGooglePlayRtdnNotification({ evidenceId, client })

    expect(fetched).toEqual([currentToken])
    await expect(getTestMembershipProviderEvidenceTerminalState(evidenceId)).resolves.toMatchObject(
      {
        verified_at: expect.any(Date),
        rejected_at: null,
      },
    )
    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ status: 'active' })
  })

  it.each([404, 410])(
    'closes the owned source when the current leaf disappears (%s)',
    async status => {
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
            latestOrderId: `synthetic-order-${randomUUID()}`,
            subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
            acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
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
      const membership = await getMembershipByUserId(user.id)
      if (!membership) throw new Error('Known Google Play source was not projected')
      const evidenceId = await createTestGooglePlayRtdnEvidence({
        applicationId,
        rawBody: Buffer.from(
          JSON.stringify({
            message: {
              messageId: `test-rtdn-${randomUUID()}`,
              data: Buffer.from(
                JSON.stringify({
                  packageName: applicationId,
                  eventTimeMillis: String(Date.now()),
                  subscriptionNotification: {
                    notificationType: 13,
                    purchaseToken,
                    subscriptionId: productId,
                  },
                }),
              ).toString('base64'),
            },
          }),
        ),
      })

      await reconcileGooglePlayRtdnNotification({
        evidenceId,
        client: {
          getSubscription: async ({ purchaseToken: fetched }) => {
            throw new GooglePlaySubscriptionLookupError(status, fetched)
          },
          acknowledgeSubscription: async () => undefined,
        },
      })

      await expect(
        getTestMembershipProviderEvidenceTerminalState(evidenceId),
      ).resolves.toMatchObject({
        verified_at: expect.any(Date),
        rejected_at: null,
        observation_count: 0,
      })
      await expect(getTestMembershipSourceState(membership.id)).resolves.toMatchObject({
        expired_at: expect.any(Date),
      })
      await expect(getMembershipByUserId(user.id)).resolves.toBeNull()
    },
  )
})
