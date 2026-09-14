import { createPrivateKey, sign as cryptoSign } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect } from '@voucha/test-helpers'
import { updateUserFields } from '@services/users'
import { getEntityRelations } from '@services/entity-relations'
import { getActorUri } from '@modules/activitypub-uris'
import {
  buildSignatureHeaders,
  computeDigest,
  generateRsaSha256KeyPair,
} from '@modules/http-signatures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  isActivityPubInboxSenderRateLimited,
  recordActivityPubInboxSenderDelivery,
  routeRateLimitConfig,
} from '@services/route-rate-limits'
import {
  approveFediverseInstance,
  createRemoteActorFixture,
  randomSuffix,
} from './inbox.test-helpers.mts'

// The signature and the actual TCP destination don't need to match — Node reports whatever Host
// header the client sends as `req.headers.host`, and `inbox.mts` signs/verifies against that
// header value, not the real socket address. A fixed host keeps signing math simple across tests.
const INBOX_HOST = 'inbox-test.example'
const INBOX_URL = `http://${INBOX_HOST}/ap/inbox`
const INBOX_PATH = new URL(INBOX_URL).pathname

function signInboxRequest(body: string, keyId: string, privateKeyPem: string) {
  return buildSignatureHeaders('POST', INBOX_URL, body, keyId, privateKeyPem)
}

// Mirrors buildSignatureHeaders but additionally covers `content-type` in the signed headers —
// the shape Mastodon actually sends. Exercises inbox.mts's additionalHeaders wiring end-to-end
// (Codex review finding #9), distinct from verify-headers.test.mts's lower-level unit coverage of
// verifySignature's additionalHeaders option itself.
function signInboxRequestWithContentType(
  body: string,
  keyId: string,
  privateKeyPem: string,
  contentType: string,
) {
  const digest = computeDigest(body)
  const date = new Date().toUTCString()
  const signingString = [
    `(request-target): post ${INBOX_PATH}`,
    `host: ${INBOX_HOST}`,
    `date: ${date}`,
    `digest: ${digest}`,
    `content-type: ${contentType}`,
  ].join('\n')

  const keyObject = createPrivateKey(privateKeyPem)
  const signature = cryptoSign('sha256', Buffer.from(signingString), keyObject).toString('base64')
  const signatureHeaderValue = [
    `keyId="${keyId}"`,
    'algorithm="rsa-sha256"',
    'headers="(request-target) host date digest content-type"',
    `signature="${signature}"`,
  ].join(',')

  return { signature: signatureHeaderValue, digest, date }
}

async function createFederatedUser() {
  const user = await createTestUserDirect()
  await updateUserFields(user.id, { fediverse_federation_enabled: true })
  return user
}

function postInbox(signature: { signature: string; digest: string; date: string }) {
  return createRequest()
    .post('/ap/inbox')
    .set('Host', INBOX_HOST)
    .set('Signature', signature.signature)
    .set('Digest', signature.digest)
    .set('Date', signature.date)
    .set('Content-Type', 'application/activity+json')
}

describe('POST /ap/inbox', () => {
  it('does not charge an invalid signature against the sender allowance', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: 1,
        activitypub_inbox_window_seconds: 60,
      }),
    )
    const { hostname, actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const body = JSON.stringify({
      id: `${actorUri}/activities/${randomSuffix()}`,
      type: 'Create',
      actor: actorUri,
      object: { type: 'Note', content: 'hello' },
    })

    await postInbox(signInboxRequest(body, keyId, privateKeyPem))
      .send(`${body} `)
      .expect(401)

    expect(await isActivityPubInboxSenderRateLimited(hostname)).toBe(false)
    await postInbox(signInboxRequest(body, keyId, privateKeyPem))
      .send(body)
      .expect(202)
    expect(await recordActivityPubInboxSenderDelivery(hostname)).toBe(true)
  })

  it('returns the configured Retry-After before fetching an approved sender actor', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: 1,
        activitypub_inbox_window_seconds: 37,
      }),
    )
    const hostname = `limited-${randomSuffix()}.example`
    await approveFediverseInstance(hostname)
    const actorUri = `https://${hostname}/users/not-cached`
    const keyId = `${actorUri}#main-key`
    const { privateKeyPem } = generateRsaSha256KeyPair()
    await recordActivityPubInboxSenderDelivery(hostname)
    await recordActivityPubInboxSenderDelivery(hostname)
    const body = JSON.stringify({
      id: `${actorUri}/activities/${randomSuffix()}`,
      type: 'Create',
      actor: actorUri,
      object: { type: 'Note', content: 'hello' },
    })

    const response = await postInbox(signInboxRequest(body, keyId, privateKeyPem))
      .send(body)
      .expect(429)

    expect(response.headers['retry-after']).toBe('37')
  })

  it('rejects a delivery that crosses the sender limit after signature verification', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: 1,
        activitypub_inbox_window_seconds: 41,
      }),
    )
    const { hostname, actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    await recordActivityPubInboxSenderDelivery(hostname)
    const body = JSON.stringify({
      id: `${actorUri}/activities/${randomSuffix()}`,
      type: 'Create',
      actor: actorUri,
      object: { type: 'Note', content: 'hello' },
    })

    const response = await postInbox(signInboxRequest(body, keyId, privateKeyPem))
      .send(body)
      .expect(429)

    expect(response.headers['retry-after']).toBe('41')
  })

  it('returns 401 when signature headers are missing', async () => {
    await createRequest()
      .post('/ap/inbox')
      .set('Content-Type', 'application/activity+json')
      .send(JSON.stringify({ id: 'x', type: 'Follow', actor: 'https://remote.example/users/x' }))
      .expect(401)
  })

  it('returns 403 without charging a sender from an unapproved instance', async () => {
    const { hostname, actorUri, keyId, privateKeyPem } = await createRemoteActorFixture({
      approved: false,
    })
    const body = JSON.stringify({
      id: `${actorUri}/activities/${randomSuffix()}`,
      type: 'Follow',
      actor: actorUri,
      object: 'https://example.invalid/does-not-matter',
    })

    await postInbox(signInboxRequest(body, keyId, privateKeyPem))
      .send(body)
      .expect(403)
    expect(await isActivityPubInboxSenderRateLimited(hostname)).toBe(false)
  })

  it('returns 401 before fetching an unknown actor when the body digest is mismatched', async () => {
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const unknownKeyId = `${keyId}-${randomSuffix()}`
    const body = JSON.stringify({
      id: `${actorUri}/activities/${randomSuffix()}`,
      type: 'Follow',
      actor: actorUri,
      object: 'https://example.invalid/does-not-matter',
    })
    const signature = signInboxRequest(body, unknownKeyId, privateKeyPem)

    // The key is intentionally unknown. A 401 proves the common digest preflight rejected the
    // tampered bytes before either delivery mode could fetch that actor.
    await postInbox(signature).send(`${body} `).expect(401)
  })

  it('returns 401 when the activity actor does not match the signing actor (spoof)', async () => {
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const body = JSON.stringify({
      id: `${actorUri}/activities/${randomSuffix()}`,
      type: 'Follow',
      actor: 'https://attacker.example/users/mallory',
      object: 'https://example.invalid/does-not-matter',
    })

    await postInbox(signInboxRequest(body, keyId, privateKeyPem))
      .send(body)
      .expect(401)
  })

  it('accepts a validly signed Follow and creates the follow relation (202)', async () => {
    const { actorUri, keyId, privateKeyPem, remoteActor } = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const body = JSON.stringify({
      id: `${actorUri}/activities/${randomSuffix()}`,
      type: 'Follow',
      actor: actorUri,
      object: getActorUri(user.id),
    })

    const response = await postInbox(signInboxRequest(body, keyId, privateKeyPem))
      .send(body)
      .expect(202)

    expect(response.body).toEqual({ received: true })
    const relations = await getEntityRelations('remote_actor', remoteActor!.id, 'follow', 'user')
    expect(relations.some(relation => relation.object_id === user.id)).toBe(true)
  })

  it('accepts a Follow whose signature additionally covers content-type (Mastodon-style)', async () => {
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const body = JSON.stringify({
      id: `${actorUri}/activities/${randomSuffix()}`,
      type: 'Follow',
      actor: actorUri,
      object: getActorUri(user.id),
    })
    const contentType = 'application/activity+json'

    const response = await postInbox(
      signInboxRequestWithContentType(body, keyId, privateKeyPem, contentType),
    )
      .send(body)
      .expect(202)

    expect(response.body).toEqual({ received: true })
  })

  it('returns 200 with duplicate:true on a replayed activity id', async () => {
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const user = await createFederatedUser()
    const body = JSON.stringify({
      id: `${actorUri}/activities/${randomSuffix()}`,
      type: 'Follow',
      actor: actorUri,
      object: getActorUri(user.id),
    })
    const signature = signInboxRequest(body, keyId, privateKeyPem)

    await postInbox(signature).send(body).expect(202)
    const replay = await postInbox(signature).send(body).expect(200)

    expect(replay.body).toEqual({ received: true, duplicate: true })
  })

  it('accepts activities of an unrecognized type as a silent no-op (202)', async () => {
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const body = JSON.stringify({
      id: `${actorUri}/activities/${randomSuffix()}`,
      type: 'Create',
      actor: actorUri,
      object: { type: 'Note', content: 'hello' },
    })

    const response = await postInbox(signInboxRequest(body, keyId, privateKeyPem))
      .send(body)
      .expect(202)

    expect(response.body).toEqual({ received: true })
  })
})
