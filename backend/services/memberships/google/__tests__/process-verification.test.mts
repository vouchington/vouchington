import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { MockAgent, createMockAgentFetchForTest } from '@voucha/test-helpers/provider-http'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'
import { getTestGooglePlayVerificationRetryState } from '@voucha/test-helpers/google-play-memberships-persistence'
import {
  createMembershipVerification,
  getMembershipByUserId,
  getMembershipVerification,
} from '@services/memberships'
import { createGooglePlaySubscriptionsV2Client } from '../configured-client.mts'
import { processGooglePlayMembershipVerification } from '../process-verification.mts'
import type { GooglePlaySubscriptionV2 } from '../types.mts'

describe('processGooglePlayMembershipVerification terminalization failure', () => {
  it('defers a permanent provider lookup loss when closing the known source fails', async () => {
    const agent = new MockAgent()
    agent.disableNetConnect()
    try {
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
      const config = {
        clientEmail: `test-${randomUUID()}@example.iam.gserviceaccount.com`,
        privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }),
      }
      agent
        .get('https://oauth2.googleapis.com')
        .intercept({ path: '/token', method: 'POST' })
        .reply(200, { access_token: 'synthetic-access-token', expires_in: 3600 })
      const client = createGooglePlaySubscriptionsV2Client(
        config,
        createMockAgentFetchForTest(agent),
      )
      const user = await createTestUser()
      const applicationId = `ai.voucha.retry-${randomUUID()}`
      const purchaseToken = `purchase-${randomUUID()}`
      const productId = `plus.monthly.${randomUUID()}`
      const sku = await createTestSku({ plan: 'plus' })
      await createTestNativeMembershipProviderProduct({
        membershipProductId: sku.id,
        provider: 'google_play',
        environment: 'test',
        applicationId,
        providerProductId: productId,
      })
      const submit = () =>
        createMembershipVerification({
          userId: user.id,
          provider: 'google_play',
          purchaseIntentId: null,
          idempotencyKey: randomUUID(),
          trustedProviderContext: { environment: 'test', applicationId },
          evidence: { purchase_token: purchaseToken },
        })
      const path = `/androidpublisher/v3/applications/${applicationId}/purchases/subscriptionsv2/tokens/${purchaseToken}`
      const subscription: GooglePlaySubscriptionV2 = {
        latestOrderId: `order-${randomUUID()}`,
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        testPurchase: {},
        externalAccountIdentifiers: {
          obfuscatedExternalAccountId: createHash('sha256').update(user.id).digest('hex'),
        },
        lineItems: [{ productId, expiryTime: new Date(Date.now() + 86_400_000).toISOString() }],
      }
      agent
        .get('https://androidpublisher.googleapis.com')
        .intercept({ path, method: 'GET' })
        .reply(200, subscription)
      const seed = await submit()
      await processGooglePlayMembershipVerification(seed.id, { client })
      const membership = await getMembershipByUserId(user.id)
      expect(membership).toMatchObject({ status: 'active' })
      agent
        .get('https://androidpublisher.googleapis.com')
        .intercept({ path, method: 'GET' })
        .reply(404, {})
      const verification = await submit()

      const { error } = await withPostgresQueryFailureForTest(
        '/* findKnownGooglePlayCurrentSource */',
        () => processGooglePlayMembershipVerification(verification.id, { client }),
        { command: 'SELECT' },
      )

      expect(error).toMatchObject({ code: '25P02' })
      await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
        status: 'pending',
        reason_code: null,
      })
      const retry = await getTestGooglePlayVerificationRetryState(verification.id)
      expect(retry).toMatchObject({
        processing_claim_token: null,
        processing_claimed_at: null,
        last_error: error.message,
      })
      expect(retry?.next_processing_at?.getTime()).toBeGreaterThan(Date.now())
      await expect(getMembershipByUserId(user.id)).resolves.toEqual(membership)
      agent.assertNoPendingInterceptors()
    } finally {
      await agent.close()
    }
  })
})
