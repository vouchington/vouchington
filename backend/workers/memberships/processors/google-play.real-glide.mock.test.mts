import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enqueueProcessGooglePlayNotification } from '@queues/memberships/enqueues'
import { memberships } from '@queues/memberships/queues'
import {
  createMembershipVerification,
  getMembershipByUserId,
  getMembershipSourceIdByMembershipId,
} from '@services/memberships'
import {
  ingestGooglePlayRtdnPush,
  processGooglePlayMembershipVerification,
  type GoogleOidcTrustMaterial,
  type GooglePlaySubscriptionsV2Client,
} from '@services/memberships/google'
import {
  recoverGooglePlayAcknowledgements,
  recoverGooglePlayActiveSources,
  recoverGooglePlayNotifications,
  processGooglePlayAcknowledgement,
  processGooglePlayActiveSource,
  processGooglePlayNotification,
} from './google-play.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { getTestGooglePlayAcknowledgementId } from '@voucha/test-helpers/google-play-memberships'

vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

describe('Google Play RTDN recovery with real PostgreSQL and GlideMQ', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('restores a lost stable job from PostgreSQL and keeps concurrent recovery deduplicated', async () => {
    const applicationId = `ai.voucha.google-${randomUUID()}`
    const purchaseToken = `google-token-${randomUUID()}`
    const { authorization, trust } = makeSignedGoogleOidcTrust()
    const accepted = await ingestGooglePlayRtdnPush({
      rawBody: makeRtdnPush({ applicationId, purchaseToken }),
      authorization,
      environment: 'test',
      applicationId,
      trust,
      enqueue: async data => {
        await enqueueProcessGooglePlayNotification(data)
      },
    })
    const jobId = `google-play-notification__${accepted.evidenceId}`

    try {
      const initialJob = await memberships.getJob(jobId)
      if (!initialJob) throw new Error('Expected RTDN ingress to create its stable job')

      // Simulate Valkey losing the accepted job while its committed RTDN evidence remains pending.
      await initialJob.remove()
      await expect(memberships.getJob(jobId)).resolves.toBeNull()

      await expect(recoverGooglePlayNotifications()).resolves.toBeUndefined()
      await Promise.all([recoverGooglePlayNotifications(), recoverGooglePlayNotifications()])

      const purchaseTokenLookupSha256 = createHash('sha256').update(purchaseToken).digest('hex')
      await expect(memberships.getJob(jobId)).resolves.toMatchObject({
        id: jobId,
        name: 'processGooglePlayNotification',
        data: {
          evidenceId: accepted.evidenceId,
          purchaseTokenLookupSha256,
          environment: 'test',
        },
        opts: {
          deduplication: { id: jobId, mode: 'simple' },
          ordering: {
            key: `google-play-token:test:${purchaseTokenLookupSha256}`,
            concurrency: 1,
          },
        },
      })
    } finally {
      const job = await memberships.getJob(jobId)
      await job?.remove()
    }
  })

  it('fans out durable active-source and acknowledgement recovery rows into stable jobs', async () => {
    const fixture = await createRecoveryFixture()
    const sourceBucket = Math.floor(Date.now() / (60 * 60 * 1000))
    const sourceJobId = `google-play-active-source__${fixture.sourceId}__${sourceBucket}`
    const acknowledgementJobId = `google-play-acknowledgement__${fixture.acknowledgementId}`

    try {
      await Promise.all([recoverGooglePlayActiveSources(), recoverGooglePlayAcknowledgements()])

      await expect(memberships.getJob(sourceJobId)).resolves.toMatchObject({
        id: sourceJobId,
        name: 'reconcileGooglePlayActiveSource',
        data: { sourceId: fixture.sourceId },
      })
      await expect(memberships.getJob(acknowledgementJobId)).resolves.toMatchObject({
        id: acknowledgementJobId,
        name: 'acknowledgeGooglePlayPurchase',
        data: { acknowledgementId: fixture.acknowledgementId },
      })
    } finally {
      await Promise.all([
        memberships.getJob(sourceJobId).then(job => job?.remove()),
        memberships.getJob(acknowledgementJobId).then(job => job?.remove()),
      ])
    }
  })

  it('enqueues a pending acknowledgement immediately after verification commits', async () => {
    const fixture = await createRecoveryFixture()
    const acknowledgementJobId = `google-play-acknowledgement__${fixture.acknowledgementId}`

    try {
      await expect(memberships.getJob(acknowledgementJobId)).resolves.toMatchObject({
        id: acknowledgementJobId,
        name: 'acknowledgeGooglePlayPurchase',
        data: { acknowledgementId: fixture.acknowledgementId },
      })
    } finally {
      await memberships.getJob(acknowledgementJobId).then(job => job?.remove())
    }
  })

  it('treats missing durable work as a no-op through each configured-client adapter', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', `tests+google-worker-${randomUUID()}@voucha.ai`)
    vi.stubEnv(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY',
      privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    )

    await expect(
      Promise.all([
        processGooglePlayNotification({ evidenceId: randomUUID() }),
        processGooglePlayActiveSource({ sourceId: randomUUID() }),
        processGooglePlayAcknowledgement({ acknowledgementId: randomUUID() }),
      ]),
    ).resolves.toEqual([undefined, undefined, undefined])
  })
})

async function createRecoveryFixture(): Promise<{ acknowledgementId: string; sourceId: string }> {
  const user = await createTestUser()
  const applicationId = `ai.voucha.google-${randomUUID()}`
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
  const verification = await createMembershipVerification({
    userId: user.id,
    provider: 'google_play',
    purchaseIntentId: null,
    idempotencyKey: randomUUID(),
    trustedProviderContext: { environment: 'test', applicationId },
    evidence: { purchase_token: purchaseToken },
  })
  await processGooglePlayMembershipVerification(verification.id, {
    client: recoveryClient({ applicationId, productId, purchaseToken, userId: user.id }),
  })
  const membership = await getMembershipByUserId(user.id)
  if (!membership) throw new Error('Expected verified Google Play membership')
  const [sourceId, acknowledgementId] = await Promise.all([
    getMembershipSourceIdByMembershipId(membership.id),
    getTestGooglePlayAcknowledgementId(verification.id),
  ])
  if (!sourceId || !acknowledgementId) throw new Error('Expected durable Google Play recovery rows')
  return { sourceId, acknowledgementId }
}

function recoveryClient(options: {
  applicationId: string
  productId: string
  purchaseToken: string
  userId: string
}): GooglePlaySubscriptionsV2Client {
  return {
    getSubscription: async ({ packageName, purchaseToken }) => {
      if (packageName !== options.applicationId || purchaseToken !== options.purchaseToken)
        throw new Error('Unexpected Google Play recovery request')
      return {
        latestOrderId: `synthetic-order-${randomUUID()}`,
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
        testPurchase: {},
        externalAccountIdentifiers: {
          obfuscatedExternalAccountId: createHash('sha256').update(options.userId).digest('hex'),
        },
        lineItems: [
          {
            productId: options.productId,
            expiryTime: new Date(Date.now() + 60 * 86_400_000).toISOString(),
          },
        ],
      }
    },
    acknowledgeSubscription: async () => undefined,
  }
}

function makeSignedGoogleOidcTrust(): {
  authorization: string
  trust: GoogleOidcTrustMaterial
} {
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
  return {
    authorization: `Bearer ${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`,
    trust: {
      issuer: 'https://accounts.google.com',
      audience,
      serviceAccountEmail,
      keysById: {
        'synthetic-key': publicKey.export({
          format: 'jwk',
        }) as GoogleOidcTrustMaterial['keysById'][string],
      },
    },
  }
}

function makeRtdnPush(options: { applicationId: string; purchaseToken: string }): Buffer {
  const notification = {
    packageName: options.applicationId,
    eventTimeMillis: String(Date.now()),
    subscriptionNotification: {
      notificationType: 2,
      purchaseToken: options.purchaseToken,
      subscriptionId: `plus.monthly.${randomUUID()}`,
    },
  }
  return Buffer.from(
    JSON.stringify({
      message: {
        messageId: `synthetic-rtdn-${randomUUID()}`,
        data: Buffer.from(JSON.stringify(notification)).toString('base64'),
      },
    }),
  )
}
