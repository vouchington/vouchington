import { createHash, randomUUID } from 'node:crypto'
import type { MockAgent } from './provider-http.mts'
import { memberships } from '../queues/memberships/queues.mts'
import { createMembershipVerification } from '../services/memberships/index.mts'
import { rejectUnavailableMembershipProvider } from '../services/memberships/provider-unavailable.mts'
import { createTestGooglePlayRtdnEvidence } from './google-play-memberships.mts'
import { createTestGooglePlayRtdnBody } from './google-play-recovery.mts'
import { googlePlayTokenPath } from './google-play-provider-stub.mts'
import {
  createTestUser,
  createTestLaunchedNativeMembershipPurchaseIntent,
  createTestNativeMembershipProviderProduct,
  createTestSku,
} from './index.mts'

type DeferralFixtures = {
  pending: { id: string }
  rateLimited: { id: string }
  pendingToken: string
  rateLimitedToken: string
}

/** One Google Play purchase that stays pending and one that the provider throttles. */
export async function createGooglePlayDeferralFixtures(
  agent: MockAgent,
): Promise<DeferralFixtures> {
  const applicationId = `ai.voucha.queue-${randomUUID()}`
  const targetProductId = `plus.monthly.${randomUUID()}`
  const currentProductId = `pro.monthly.${randomUUID()}`
  const pendingToken = `pending-${randomUUID()}`
  const rateLimitedToken = `rate-${randomUUID()}`
  const user = await createTestUser()
  const sku = await createTestSku({ plan: 'plus' })
  const target = await createTestNativeMembershipProviderProduct({
    membershipProductId: sku.id,
    provider: 'google_play',
    environment: 'test',
    applicationId,
    providerProductId: targetProductId,
    basePlanId: 'target-plan',
  })
  const purchaseIntentId = await createTestLaunchedNativeMembershipPurchaseIntent({
    userId: user.id,
    membershipProviderProductId: target.id,
  })
  const pending = await createMembershipVerification({
    userId: user.id,
    provider: 'google_play',
    purchaseIntentId,
    idempotencyKey: randomUUID(),
    evidence: { purchase_token: pendingToken },
  })
  const rateLimited = await createMembershipVerification({
    userId: user.id,
    provider: 'google_play',
    purchaseIntentId: null,
    idempotencyKey: randomUUID(),
    trustedProviderContext: { environment: 'test', applicationId },
    evidence: { purchase_token: rateLimitedToken },
  })
  await Promise.all([
    (await memberships.getJob(pending.id))?.remove(),
    (await memberships.getJob(rateLimited.id))?.remove(),
  ])
  agent
    .get('https://oauth2.googleapis.com')
    .intercept({ path: '/token', method: 'POST' })
    .reply(200, { access_token: 'synthetic-access-token', expires_in: 3600 })
  agent
    .get('https://androidpublisher.googleapis.com')
    .intercept({ path: googlePlayTokenPath(applicationId, pendingToken), method: 'GET' })
    .reply(200, {
      latestOrderId: `order-${randomUUID()}`,
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      testPurchase: {},
      externalAccountIdentifiers: {
        obfuscatedExternalAccountId: createHash('sha256').update(user.id).digest('hex'),
      },
      lineItems: [
        {
          productId: currentProductId,
          expiryTime: new Date(Date.now() + 86_400_000).toISOString(),
          deferredItemReplacement: { productId: targetProductId },
        },
        { productId: targetProductId },
      ],
    })
  agent
    .get('https://androidpublisher.googleapis.com')
    .intercept({ path: googlePlayTokenPath(applicationId, rateLimitedToken), method: 'GET' })
    .reply(429, {}, { headers: { 'retry-after': '30' } })
  return { pending, rateLimited, pendingToken, rateLimitedToken }
}

export async function cleanUpGooglePlayDeferralFixtures(fixtures: DeferralFixtures): Promise<void> {
  const ids = [fixtures.pending.id, fixtures.rateLimited.id]
  await Promise.all(ids.map(id => rejectUnavailableMembershipProvider(id)))
  await Promise.all(ids.map(async id => (await memberships.getJob(id))?.remove()))
}

/** RTDN evidence with no bound purchase, so its lookup needs a provider call. */
export async function createUnboundGooglePlayRtdnFixture(agent: MockAgent) {
  const applicationId = `com.voucha.test.${randomUUID().replaceAll('-', '')}`
  const purchaseToken = `unbound-${randomUUID()}`
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
  agent
    .get('https://oauth2.googleapis.com')
    .intercept({ path: '/token', method: 'POST' })
    .reply(200, { access_token: 'synthetic-access-token', expires_in: 3600 })
  agent
    .get('https://androidpublisher.googleapis.com')
    .intercept({ path: googlePlayTokenPath(applicationId, purchaseToken), method: 'GET' })
    .reply(200, {
      latestOrderId: `order-${randomUUID()}`,
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      testPurchase: {},
      lineItems: [],
    })
  return { evidenceId, purchaseToken }
}
