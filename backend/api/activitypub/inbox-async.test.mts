import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import { registerActivityPubInboxJobCleanup } from '@voucha/test-helpers/activitypub-inbox-test-jobs'
import { setTestRemoteActorFetchedAt } from '@voucha/test-helpers/entities/remote-actors'
import { failNextOwnedActivityPubInboxEnqueue } from '@voucha/test-helpers/activitypub-inbox-enqueue-failure'
import { postInbox, signInboxRequest } from '@voucha/test-helpers/activitypub-inbox-api-requests'
import {
  createRemoteActorFixture,
  randomSuffix,
} from '@voucha/test-helpers/api/activitypub/inbox.fixtures'
import {
  ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES,
  computeActivityPubInboxRequestDigest,
} from '@services/ap-inbox-activities'

function makeBody(actorUri: string) {
  return JSON.stringify({
    id: `${actorUri}/activities/${randomSuffix()}`,
    type: 'Create',
    actor: actorUri,
    object: { type: 'Note', content: 'queued' },
  })
}

describe('POST /ap/inbox queue admission', () => {
  it('enqueues the exact signed request once by digest', async () => {
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const body = makeBody(actorUri)
    const signed = signInboxRequest(body, keyId, privateKeyPem)
    const requestDigest = computeActivityPubInboxRequestDigest({
      requestMethod: 'POST',
      requestTarget: '/ap/inbox',
      expectedHost: 'inbox-test.example',
      signatureHeader: signed.signature,
      digestHeader: signed.digest,
      dateHeader: signed.date,
      contentTypeHeader: 'application/activity+json',
      rawBody: Buffer.from(body),
    })
    const jobId = `activitypub-inbox__${requestDigest}`
    onTestFinished(async () => {
      await (await backgroundQueue.getJob(jobId))?.remove()
    })

    await postInbox(signed).send(body).expect(202)
    await postInbox(signed).send(body).expect(202)

    const job = await backgroundQueue.getJob(jobId)
    expect(job?.data).toMatchObject({
      requestDigest,
      rawBodyBase64: Buffer.from(body).toString('base64'),
      verifiedRemoteActorId: expect.any(String),
      senderAllowed: true,
    })
  })

  it('returns 413 before enqueue for a body over the cap', async () => {
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const body = makeBody(actorUri) + ' '.repeat(ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES)
    await postInbox(signInboxRequest(body, keyId, privateKeyPem))
      .send(body)
      .expect(413)
  })

  it('does not acknowledge an envelope when queue admission fails', async () => {
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const body = makeBody(actorUri)
    const requestId = randomUUID()
    failNextOwnedActivityPubInboxEnqueue(requestId)
    await postInbox(signInboxRequest(body, keyId, privateKeyPem))
      .set('x-request-id', requestId)
      .send(body)
      .expect(500)
  })

  it('defers a stale cached key to the worker so a rotated key can be fetched', async () => {
    const { actorUri, keyId } = await createRemoteActorFixture()
    await setTestRemoteActorFetchedAt(actorUri, new Date(Date.now() - 2 * 60 * 60 * 1000))
    const body = makeBody(actorUri)
    const { privateKeyPem: rotatedPrivateKey } = generateRsaSha256KeyPair()
    const signed = signInboxRequest(body, keyId, rotatedPrivateKey)
    const requestDigest = computeActivityPubInboxRequestDigest({
      requestMethod: 'POST',
      requestTarget: '/ap/inbox',
      expectedHost: 'inbox-test.example',
      signatureHeader: signed.signature,
      digestHeader: signed.digest,
      dateHeader: signed.date,
      contentTypeHeader: 'application/activity+json',
      rawBody: Buffer.from(body),
    })
    registerActivityPubInboxJobCleanup(requestDigest)

    await postInbox(signed).send(body).expect(202)

    const job = await backgroundQueue.getJob(`activitypub-inbox__${requestDigest}`)
    expect(job?.data).toMatchObject({
      requestDigest,
      rawBodyBase64: Buffer.from(body).toString('base64'),
    })
    expect(job?.data).not.toHaveProperty('verifiedRemoteActorId')
    expect(job?.data).not.toHaveProperty('senderAllowed')
  })

  it('rejects a fresh cached key with an invalid signature before enqueue', async () => {
    const { actorUri, keyId } = await createRemoteActorFixture()
    const body = makeBody(actorUri)
    const { privateKeyPem: differentPrivateKey } = generateRsaSha256KeyPair()
    const signed = signInboxRequest(body, keyId, differentPrivateKey)
    const requestDigest = computeActivityPubInboxRequestDigest({
      requestMethod: 'POST',
      requestTarget: '/ap/inbox',
      expectedHost: 'inbox-test.example',
      signatureHeader: signed.signature,
      digestHeader: signed.digest,
      dateHeader: signed.date,
      contentTypeHeader: 'application/activity+json',
      rawBody: Buffer.from(body),
    })
    registerActivityPubInboxJobCleanup(requestDigest)

    await postInbox(signed).send(body).expect(401)
    expect(await backgroundQueue.getJob(`activitypub-inbox__${requestDigest}`)).toBeNull()
  })
})
