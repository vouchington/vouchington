import { failNextOwnedActivityPubInboxEnqueue } from '@voucha/test-helpers/activitypub-inbox-enqueue-failure'
import {
  observeActivityPubInboxRequestEnqueues,
  registerActivityPubInboxRequestCleanup,
} from '@voucha/test-helpers/activitypub-inbox-request-enqueues'
import { getActivityPubInboxDeliveryIdForTest } from '@voucha/test-helpers/entities/activitypub-inbox'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { buildSignatureHeaders } from '@modules/http-signatures'
import { computeDigest } from '@vouchington/utils/http-signatures'
import { activitypub } from '@queues/activitypub/queues'
import { activityPubInboxConfig } from '@services/ap-inbox-activities'
import {
  claimTestDelivery,
  registerActivityPubInboxAdmission,
  rejectTestDelivery,
} from '@voucha/test-helpers/activitypub-inbox-transitions'
import { createRequest } from '@voucha/test-helpers/api/server'
import { activityPubInboxDeliveryExistsOnPrimaryForTest } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createRemoteActorFixture,
  randomSuffix,
} from '@voucha/test-helpers/api/activitypub/inbox.fixtures'

const INBOX_HOST = 'inbox-async-test.example'
const INBOX_URL = `http://${INBOX_HOST}/ap/inbox`

registerActivityPubInboxAdmission()

describe('POST /ap/inbox durable worker path', () => {
  it('verifies the signature before durable persistence', async () => {
    const { delivery, remoteActor } = await postSignedCreateAndClaimDelivery({
      noteContent: 'queued',
      signatureKeyId: actorKeyId => actorKeyId,
    })
    expect(delivery).toMatchObject({
      remoteActorId: remoteActor.id,
      verifiedAt: expect.any(Date),
      senderAllowedAt: expect.any(Date),
    })
  })

  it('returns 202 after persistence without waiting for an unknown actor fetch', async () => {
    const { delivery } = await postSignedCreateAndClaimDelivery({
      noteContent: 'queued unknown actor',
      signatureKeyId: actorKeyId => `${actorKeyId}-${randomSuffix()}`,
    })
    expect(delivery).toMatchObject({
      remoteActorId: null,
      verifiedAt: null,
      senderAllowedAt: null,
    })
  })

  it('rejects an invalid signature before durable persistence', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
        async_delivery_enabled: true,
      }),
    )
    const { actorUri, keyId } = await createRemoteActorFixture()
    const activityId = `${actorUri}/activities/${randomSuffix()}`
    const body = JSON.stringify({
      id: activityId,
      type: 'Create',
      actor: actorUri,
      object: { type: 'Note', content: 'invalid signature' },
    })
    const headers = {
      signature: `keyId="${keyId}",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="not-real"`,
      digest: computeDigest(body),
      date: new Date().toUTCString(),
    }
    registerActivityPubInboxRequestCleanup(activityId)
    const requestId = randomUUID()

    const { enqueueCalls } = await observeActivityPubInboxRequestEnqueues(requestId, () =>
      createRequest()
        .post('/ap/inbox')
        .set('x-request-id', requestId)
        .set('Host', INBOX_HOST)
        .set('Signature', headers.signature)
        .set('Digest', headers.digest)
        .set('Date', headers.date)
        .set('Content-Type', 'application/activity+json')
        .send(body)
        .expect(401),
    )

    expect(enqueueCalls).toBe(0)
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(activityId)).toBe(false)
  })

  it('rejects a mismatched body digest before persisting or enqueueing', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
        async_delivery_enabled: true,
      }),
    )
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const activityId = `${actorUri}/activities/${randomSuffix()}`
    const body = JSON.stringify({
      id: activityId,
      type: 'Create',
      actor: actorUri,
      object: { type: 'Note', content: 'digest mismatch' },
    })
    const headers = buildSignatureHeaders('POST', INBOX_URL, body, keyId, privateKeyPem)
    registerActivityPubInboxRequestCleanup(activityId)
    const requestId = randomUUID()

    const { enqueueCalls } = await observeActivityPubInboxRequestEnqueues(requestId, () =>
      createRequest()
        .post('/ap/inbox')
        .set('x-request-id', requestId)
        .set('Host', INBOX_HOST)
        .set('Signature', headers.signature)
        .set('Digest', headers.digest)
        .set('Date', headers.date)
        .set('Content-Type', 'application/activity+json')
        .send(`${body} `)
        .expect(401),
    )

    expect(enqueueCalls).toBe(0)
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(activityId)).toBe(false)
  })

  it('keeps the persisted envelope and returns 202 when the initial enqueue fails', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
        async_delivery_enabled: true,
      }),
    )
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const activityId = `${actorUri}/activities/${randomSuffix()}`
    const body = JSON.stringify({
      id: activityId,
      type: 'Create',
      actor: actorUri,
      object: { type: 'Note', content: 'persist despite queue outage' },
    })
    const headers = buildSignatureHeaders('POST', INBOX_URL, body, keyId, privateKeyPem)
    registerActivityPubInboxRequestCleanup(activityId)
    const requestId = randomUUID()
    failNextOwnedActivityPubInboxEnqueue(requestId)

    const response = await createRequest()
      .post('/ap/inbox')
      .set('x-request-id', requestId)
      .set('Host', INBOX_HOST)
      .set('Signature', headers.signature)
      .set('Digest', headers.digest)
      .set('Date', headers.date)
      .set('Content-Type', 'application/activity+json')
      .send(body)
      .expect(202)

    expect(response.body).toEqual({ received: true })
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(activityId)).toBe(true)
  })
})

async function postSignedCreateAndClaimDelivery(input: {
  noteContent: string
  signatureKeyId: (actorKeyId: string) => string
}) {
  onTestFinished(
    overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
      async_delivery_enabled: true,
    }),
  )
  const { actorUri, keyId, privateKeyPem, remoteActor } = await createRemoteActorFixture()
  const signatureKeyId = input.signatureKeyId(keyId)
  const activityId = `${actorUri}/activities/${randomSuffix()}`
  const body = JSON.stringify({
    id: activityId,
    type: 'Create',
    actor: actorUri,
    object: { type: 'Note', content: input.noteContent },
  })
  const headers = buildSignatureHeaders('POST', INBOX_URL, body, signatureKeyId, privateKeyPem)
  const { captureDeliveryId } = registerActivityPubInboxRequestCleanup(activityId)
  await createRequest()
    .post('/ap/inbox')
    .set('Host', INBOX_HOST)
    .set('Signature', headers.signature)
    .set('Digest', headers.digest)
    .set('Date', headers.date)
    .set('Content-Type', 'application/activity+json')
    .send(body)
    .expect(202)

  const deliveryId = await getActivityPubInboxDeliveryIdForTest(activityId)
  expect(deliveryId).toBeDefined()
  if (deliveryId) captureDeliveryId(deliveryId)
  const job = (await getInboxJobs()).find(candidate => {
    const data: unknown = candidate.data
    return (
      candidate.name === 'activitypub.processDelivery' &&
      typeof data === 'object' &&
      data !== null &&
      'deliveryId' in data &&
      data.deliveryId === deliveryId
    )
  })
  expect(job).toBeDefined()
  const payload = job?.data as { deliveryId: string; leaseToken: string } | undefined
  expect(payload).toEqual({
    deliveryId: expect.any(String),
    leaseToken: expect.any(String),
  })
  if (!payload) throw new Error('Expected a durable ActivityPub inbox job payload')

  const delivery = await claimTestDelivery(payload.deliveryId, payload.leaseToken)
  expect(delivery).toMatchObject({
    requestMethod: 'POST',
    requestTarget: '/ap/inbox',
    expectedHost: INBOX_HOST,
    signatureHeader: headers.signature,
    digestHeader: headers.digest,
    dateHeader: headers.date,
    contentTypeHeader: 'application/activity+json',
    claimedActivityId: activityId,
    claimedActivityType: 'Create',
    claimedActorUri: actorUri,
    senderHostname: new URL(actorUri).hostname,
  })
  expect(delivery?.rawBody.equals(Buffer.from(body))).toBe(true)

  onTestFinished(async () => {
    await rejectTestDelivery(payload.deliveryId, payload.leaseToken)
  })
  return { delivery, remoteActor }
}

async function getInboxJobs() {
  return (
    await Promise.all(
      (['waiting', 'active', 'completed', 'failed', 'delayed'] as const).map(state =>
        activitypub.getJobs(state),
      ),
    )
  ).flat()
}
