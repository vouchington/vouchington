import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId } from '@services/memberships'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import {
  createTestLaunchedNativeMembershipPurchaseIntent,
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { ingestGooglePlayRtdnPush, InvalidGooglePlayRtdnError } from './notification-ingress.mts'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import { reconcileGooglePlayRtdnNotification } from './reconcile-notification.mts'
import type {
  GoogleOidcTrustMaterial,
  GooglePlaySubscriptionV2,
  GooglePlaySubscriptionsV2Client,
} from './types.mts'

describe('Google Play RTDN lifecycle integration', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('binds a pending purchase without access, then projects its approved RTDN for the same owner', async () => {
    const user = await createTestUser()
    const applicationId = `ai.voucha.google-${randomUUID()}`
    const productId = `plus.monthly.${randomUUID()}`
    const purchaseToken = `google-token-${randomUUID()}`
    const accountId = createHash('sha256').update(user.id).digest('hex')
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('GOOGLE_PLAY_APPLICATION_ID', applicationId)
    const sku = await createTestSku({ plan: 'plus' })
    const mapping = await createTestNativeMembershipProviderProduct({
      membershipProductId: sku.id,
      provider: 'google_play',
      environment: 'test',
      applicationId,
      providerProductId: productId,
    })
    const purchaseIntentId = await createTestLaunchedNativeMembershipPurchaseIntent({
      userId: user.id,
      membershipProviderProductId: mapping.id,
    })
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: purchaseToken },
    })
    let state: GooglePlaySubscriptionV2['subscriptionState'] = 'SUBSCRIPTION_STATE_PENDING'
    let expiryTime = new Date(Date.now() + 60 * 86_400_000).toISOString()
    const client: GooglePlaySubscriptionsV2Client = {
      getSubscription: async () => ({
        latestOrderId: 'synthetic-order',
        subscriptionState: state,
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        testPurchase: {},
        externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId },
        lineItems: [{ productId, expiryTime }],
      }),
      acknowledgeSubscription: async () => {
        throw new Error('Already acknowledged; no Play mutation expected')
      },
    }
    await processGooglePlayMembershipVerification(verification.id, { client })
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'pending',
    })
    await expect(getMembershipByUserId(user.id)).resolves.toBeNull()

    state = 'SUBSCRIPTION_STATE_ACTIVE'
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const audience = `https://example.com/google-push/${randomUUID()}`
    const serviceAccountEmail = `push-${randomUUID()}@example.iam.gserviceaccount.com`
    const now = Math.floor(Date.now() / 1000)
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'synthetic-key' })).toString(
      'base64url',
    )
    const claims = Buffer.from(
      JSON.stringify({
        iss: 'https://accounts.google.com',
        aud: audience,
        email: serviceAccountEmail,
        email_verified: true,
        iat: now,
        exp: now + 300,
      }),
    ).toString('base64url')
    const input = `${header}.${claims}`
    const jwt = `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`
    const trust: GoogleOidcTrustMaterial = {
      issuer: 'https://accounts.google.com',
      audience,
      serviceAccountEmail,
      keysById: {
        'synthetic-key': publicKey.export({
          format: 'jwk',
        }) as GoogleOidcTrustMaterial['keysById'][string],
      },
    }
    const notification = {
      packageName: applicationId,
      eventTimeMillis: String(Date.now()),
      subscriptionNotification: { notificationType: 2, purchaseToken, subscriptionId: productId },
    }
    const messageId = `synthetic-rtdn-${randomUUID()}`
    const rawBody = Buffer.from(
      JSON.stringify({
        message: {
          messageId,
          data: Buffer.from(JSON.stringify(notification)).toString('base64'),
        },
      }),
    )
    const ingress = await ingestGooglePlayRtdnPush({
      rawBody,
      authorization: `Bearer ${jwt}`,
      environment: 'test',
      applicationId,
      trust,
      enqueue: async () => undefined,
    })
    const conflictingBody = Buffer.from(
      JSON.stringify({
        message: {
          messageId,
          data: Buffer.from(
            JSON.stringify({
              ...notification,
              subscriptionNotification: {
                ...notification.subscriptionNotification,
                purchaseToken: `different-token-${randomUUID()}`,
              },
            }),
          ).toString('base64'),
        },
      }),
    )
    await expect(
      ingestGooglePlayRtdnPush({
        rawBody: conflictingBody,
        authorization: `Bearer ${jwt}`,
        environment: 'test',
        applicationId,
        trust,
        enqueue: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(InvalidGooglePlayRtdnError)
    await reconcileGooglePlayRtdnNotification({ evidenceId: ingress.evidenceId, client })

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({ plan: 'plus' })

    state = 'SUBSCRIPTION_STATE_EXPIRED'
    expiryTime = new Date(Date.now() - 60_000).toISOString()
    const revokedBody = Buffer.from(
      JSON.stringify({
        message: {
          messageId: `synthetic-revocation-${randomUUID()}`,
          data: Buffer.from(
            JSON.stringify({
              ...notification,
              subscriptionNotification: {
                ...notification.subscriptionNotification,
                notificationType: 12,
              },
            }),
          ).toString('base64'),
        },
      }),
    )
    const revocation = await ingestGooglePlayRtdnPush({
      rawBody: revokedBody,
      authorization: `Bearer ${jwt}`,
      environment: 'test',
      applicationId,
      trust,
      enqueue: async () => undefined,
    })
    await reconcileGooglePlayRtdnNotification({ evidenceId: revocation.evidenceId, client })
    await expect(getMembershipByUserId(user.id)).resolves.toBeNull()
  })
})
