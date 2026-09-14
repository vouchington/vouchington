import { describe, expect, it, onTestFinished } from 'vitest'
import { createRequest, nextTestRequestIp } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { activityPubInboxDeliveryExistsOnPrimaryForTest } from '@voucha/test-helpers'
import { buildSignatureHeaders, generateRsaSha256KeyPair } from '@modules/http-signatures'
import { activityPubInboxConfig } from '@services/ap-inbox-activities'
import {
  isActivityPubInboxAttemptRateLimited,
  isActivityPubInboxSenderRateLimited,
  recordActivityPubInboxAttempt,
  recordActivityPubInboxSenderDelivery,
  routeRateLimitConfig,
} from '@services/route-rate-limits'
import {
  approveFediverseInstance,
  createRemoteActorFixture,
  randomSuffix,
} from './inbox.test-helpers.mts'

const INBOX_URL = 'http://inbox-test.example/ap/inbox'

function makeBody(actorUri: string): string {
  return JSON.stringify({
    id: `${actorUri}/activities/${randomSuffix()}`,
    type: 'Create',
    actor: actorUri,
    object: { type: 'Note', content: 'hello' },
  })
}

function signInboxRequest(body: string, keyId: string, privateKeyPem: string) {
  return buildSignatureHeaders('POST', INBOX_URL, body, keyId, privateKeyPem)
}

function postInbox(
  sourceIp: string,
  signature: { signature: string; digest: string; date: string },
) {
  return createRequest()
    .post('/ap/inbox')
    .set('x-forwarded-for', sourceIp)
    .set('Host', 'inbox-test.example')
    .set('Signature', signature.signature)
    .set('Digest', signature.digest)
    .set('Date', signature.date)
    .set('Content-Type', 'application/activity+json')
}

function configureAttemptLimit(maxRequests: number, windowSeconds = 60): void {
  onTestFinished(
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      activitypub_inbox_attempt_max_requests: maxRequests,
      activitypub_inbox_attempt_window_seconds: windowSeconds,
    }),
  )
}

function makeUnapprovedRequest() {
  const hostname = `unapproved-${randomSuffix()}.example`
  const actorUri = `https://${hostname}/users/actor`
  const keyId = `${actorUri}#main-key`
  const { privateKeyPem } = generateRsaSha256KeyPair()
  const body = makeBody(actorUri)
  return { hostname, body, signature: signInboxRequest(body, keyId, privateKeyPem) }
}

describe('POST /ap/inbox pre-verification attempt limit', () => {
  it('accepts the configured number of attempts and rejects the next with Retry-After', async () => {
    configureAttemptLimit(2, 17)
    const sourceIp = nextTestRequestIp()
    const request = makeUnapprovedRequest()

    await postInbox(sourceIp, request.signature).send(request.body).expect(403)
    await postInbox(sourceIp, request.signature).send(request.body).expect(403)
    const response = await postInbox(sourceIp, request.signature).send(request.body).expect(429)

    expect(response.headers['retry-after']).toBe('17')
    expect(await isActivityPubInboxAttemptRateLimited(sourceIp)).toBe(true)
  })

  it('keeps source IP attempt buckets isolated', async () => {
    configureAttemptLimit(1)
    const firstIp = nextTestRequestIp()
    const secondIp = nextTestRequestIp()
    const firstHostnameRequest = makeUnapprovedRequest()
    const secondHostnameRequest = makeUnapprovedRequest()

    await postInbox(firstIp, firstHostnameRequest.signature)
      .send(firstHostnameRequest.body)
      .expect(403)
    await postInbox(firstIp, secondHostnameRequest.signature)
      .send(secondHostnameRequest.body)
      .expect(429)
    await postInbox(secondIp, firstHostnameRequest.signature)
      .send(firstHostnameRequest.body)
      .expect(403)
  })

  it('does not let a spoofed hostname from an exhausted IP block a valid different IP', async () => {
    configureAttemptLimit(1)
    const exhaustedIp = nextTestRequestIp()
    const validIp = nextTestRequestIp()
    const spoofed = makeUnapprovedRequest()
    await postInbox(exhaustedIp, spoofed.signature).send(spoofed.body).expect(403)
    await postInbox(exhaustedIp, spoofed.signature).send(spoofed.body).expect(429)

    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const validBody = makeBody(actorUri)
    await postInbox(validIp, signInboxRequest(validBody, keyId, privateKeyPem))
      .send(validBody)
      .expect(202)
  })

  it('charges invalid signatures to the attempt bucket but not the valid sender bucket', async () => {
    configureAttemptLimit(1)
    onTestFinished(
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: 1,
        activitypub_inbox_window_seconds: 60,
      }),
    )
    const invalidIp = nextTestRequestIp()
    const validIp = nextTestRequestIp()
    const { hostname, actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const body = makeBody(actorUri)
    const signature = signInboxRequest(body, keyId, privateKeyPem)

    await postInbox(invalidIp, signature).send(`${body} `).expect(401)
    expect(await isActivityPubInboxSenderRateLimited(hostname)).toBe(false)
    await postInbox(invalidIp, signature).send(`${body} `).expect(429)

    await postInbox(validIp, signature).send(body).expect(202)
    expect(await recordActivityPubInboxSenderDelivery(hostname)).toBe(true)
  })

  it('rejects an exhausted IP before buffering the request body or resolving an actor', async () => {
    configureAttemptLimit(1)
    const sourceIp = nextTestRequestIp()
    await recordActivityPubInboxAttempt(sourceIp)
    await recordActivityPubInboxAttempt(sourceIp)
    const hostname = `not-cached-${randomSuffix()}.example`
    await approveFediverseInstance(hostname)
    const actorUri = `https://${hostname}/users/not-cached`
    const keyId = `${actorUri}#main-key`
    const { privateKeyPem } = generateRsaSha256KeyPair()
    const signedBody = makeBody(actorUri)
    const oversizedBody = `${signedBody}${' '.repeat(1024 * 1024)}`

    await postInbox(sourceIp, signInboxRequest(signedBody, keyId, privateKeyPem))
      .send(oversizedBody)
      .expect(429)
  })

  it('charges structured requests from unapproved instances', async () => {
    configureAttemptLimit(1)
    const sourceIp = nextTestRequestIp()
    const request = makeUnapprovedRequest()

    await createRequest()
      .post('/ap/inbox')
      .set('x-forwarded-for', sourceIp)
      .set('Content-Type', 'application/activity+json')
      .send(request.body)
      .expect(401)
    await postInbox(sourceIp, request.signature).send(request.body).expect(403)
    await postInbox(sourceIp, request.signature).send(request.body).expect(429)
  })

  it('rejects a cached signer at the post-verify sender limit before durable persist', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
        async_delivery_enabled: true,
      }),
    )
    onTestFinished(
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        activitypub_inbox_max_requests: 1,
        activitypub_inbox_window_seconds: 60,
      }),
    )
    const { hostname, actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    expect(await recordActivityPubInboxSenderDelivery(hostname)).toBe(false)
    const activityId = `${actorUri}/activities/${randomSuffix()}`
    const body = JSON.stringify({
      id: activityId,
      type: 'Create',
      actor: actorUri,
      object: { type: 'Note', content: 'sender limited after verify' },
    })
    const response = await postInbox(
      nextTestRequestIp(),
      signInboxRequest(body, keyId, privateKeyPem),
    )
      .send(body)
      .expect(429)

    expect(response.headers['retry-after']).toBe('60')
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(activityId)).toBe(false)
  })
})
