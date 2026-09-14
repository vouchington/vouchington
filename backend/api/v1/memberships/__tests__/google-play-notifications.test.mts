import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { googleOidcValkeyTrustStore } from '@services/memberships/google'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const keyId = `google-play-route-${randomUUID()}`
const audience = 'https://example.com/google-play-route'
const serviceAccountEmail = 'play-route@example.iam.gserviceaccount.com'

describe('Google Play RTDN ingress route', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
    await googleOidcValkeyTrustStore.save({ keysById: {}, expiresAt: new Date(0) })
  })

  it('fails retryably when Pub/Sub identity is not configured', async () => {
    vi.stubEnv('GOOGLE_PLAY_PUBSUB_AUDIENCE', undefined)
    vi.stubEnv('GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL', undefined)

    await createRequest()
      .post('/api/v1/memberships/google-play/notifications')
      .set('Authorization', 'Bearer invalid')
      .send({ message: { data: 'e30=' } })
      .expect(503)
  })

  it('checks cached OIDC trust, rejects invalid callers, and acknowledges ignored notifications', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('GOOGLE_PLAY_PUBSUB_AUDIENCE', audience)
    vi.stubEnv('GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL', serviceAccountEmail)
    await googleOidcValkeyTrustStore.save({ keysById: {}, expiresAt: new Date(0) })
    const request = createRequest()
    const notification = {
      packageName: 'ai.voucha.android',
      testNotification: { version: '1.0' },
    }
    const envelope = {
      message: {
        messageId: `synthetic-${randomUUID()}`,
        data: Buffer.from(JSON.stringify(notification)).toString('base64'),
      },
    }
    await request.post('/api/v1/memberships/google-play/notifications').send(envelope).expect(503)

    await googleOidcValkeyTrustStore.save({
      keysById: {
        [keyId]: publicKey.export({ format: 'jwk' }) as { kty: 'RSA'; n: string; e: string },
      },
      expiresAt: new Date(Date.now() + 60_000),
    })
    await request
      .post('/api/v1/memberships/google-play/notifications')
      .set('Authorization', `Bearer ${oidcJwt(keyId)}`)
      .set('Content-Type', 'application/json')
      .send('{"message":')
      .expect(401)
    await request.post('/api/v1/memberships/google-play/notifications').send(envelope).expect(401)
    await request
      .post('/api/v1/memberships/google-play/notifications')
      .set('Authorization', `Bearer ${oidcJwt('unknown-key')}`)
      .send(envelope)
      .expect(503)
    await request
      .post('/api/v1/memberships/google-play/notifications')
      .set('Authorization', `Bearer ${oidcJwt(keyId)}`)
      .send(envelope)
      .expect(200, { received: true })
  })

  it('durably enqueues an authenticated subscription notification', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('GOOGLE_PLAY_PUBSUB_AUDIENCE', audience)
    vi.stubEnv('GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL', serviceAccountEmail)
    await googleOidcValkeyTrustStore.save({
      keysById: {
        [keyId]: publicKey.export({ format: 'jwk' }) as { kty: 'RSA'; n: string; e: string },
      },
      expiresAt: new Date(Date.now() + 60_000),
    })
    const messageId = `synthetic-${randomUUID()}`
    const purchaseToken = `token-${randomUUID()}`
    const envelope = {
      message: {
        messageId,
        data: Buffer.from(
          JSON.stringify({
            packageName: 'ai.voucha.android',
            eventTimeMillis: String(Date.now()),
            subscriptionNotification: {
              notificationType: 2,
              purchaseToken,
              subscriptionId: 'plus.monthly',
            },
          }),
        ).toString('base64'),
      },
    }

    await createRequest()
      .post('/api/v1/memberships/google-play/notifications')
      .set('Authorization', `Bearer ${oidcJwt(keyId)}`)
      .send(envelope)
      .expect(202, { received: true })

    const purchaseTokenLookupSha256 = createHash('sha256').update(purchaseToken).digest('hex')
    const jobs = await readAllQueueJobs(memberships)
    const job = jobs.find(
      (
        item,
      ): item is (typeof jobs)[number] & {
        data: { evidenceId: string; purchaseTokenLookupSha256: string }
      } =>
        item.name === 'processGooglePlayNotification' &&
        typeof item.data === 'object' &&
        item.data !== null &&
        'evidenceId' in item.data &&
        typeof item.data.evidenceId === 'string' &&
        'purchaseTokenLookupSha256' in item.data &&
        item.data.purchaseTokenLookupSha256 === purchaseTokenLookupSha256,
    )
    if (!job) throw new Error('Expected Google Play RTDN job')
    expect(job).toMatchObject({
      id: `google-play-notification__${job.data.evidenceId}`,
      name: 'processGooglePlayNotification',
    })
  })

  it('propagates an unexpected durable-write failure as a server error', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.stubEnv('GOOGLE_PLAY_PUBSUB_AUDIENCE', audience)
    vi.stubEnv('GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL', serviceAccountEmail)
    await googleOidcValkeyTrustStore.save({
      keysById: {
        [keyId]: publicKey.export({ format: 'jwk' }) as { kty: 'RSA'; n: string; e: string },
      },
      expiresAt: new Date(Date.now() + 60_000),
    })
    const envelope = {
      message: {
        messageId: '\u0000',
        data: Buffer.from(
          JSON.stringify({
            packageName: 'ai.voucha.android',
            eventTimeMillis: String(Date.now()),
            subscriptionNotification: {
              notificationType: 2,
              purchaseToken: `token-${randomUUID()}`,
              subscriptionId: 'plus.monthly',
            },
          }),
        ).toString('base64'),
      },
    }

    await createRequest()
      .post('/api/v1/memberships/google-play/notifications')
      .set('Authorization', `Bearer ${oidcJwt(keyId)}`)
      .send(envelope)
      .expect(500)
  })
})

function oidcJwt(kid: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url')
  const claims = Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: audience,
      email: serviceAccountEmail,
      email_verified: true,
      iat: now - 30,
      exp: now + 300,
    }),
  ).toString('base64url')
  const input = `${header}.${claims}`
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`
}
