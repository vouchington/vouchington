import { describe, expect, it, onTestFinished } from 'vitest'
import { buildSignatureHeaders, computeDigest } from '@modules/http-signatures'
import { activitypubInbox } from '@queues/activitypub-inbox/queues'
import { activityPubInboxConfig } from '@services/ap-inbox-activities'
import {
  claimTestDelivery,
  rejectTestDelivery,
} from '@services/ap-inbox-activities/durable-delivery-transitions.test-support'
import { createRequest } from '@voucha/test-helpers/api/server'
import { activityPubInboxDeliveryExistsOnPrimaryForTest } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createRemoteActorFixture, randomSuffix } from './inbox.test-helpers.mts'

const INBOX_HOST = 'inbox-async-test.example'
const INBOX_URL = `http://${INBOX_HOST}/ap/inbox`

describe('POST /ap/inbox durable worker path', () => {
  it('verifies the signature before durable persistence', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
        async_delivery_enabled: true,
      }),
    )
    const { actorUri, keyId, privateKeyPem, remoteActor } = await createRemoteActorFixture()
    const activityId = `${actorUri}/activities/${randomSuffix()}`
    const body = JSON.stringify({
      id: activityId,
      type: 'Create',
      actor: actorUri,
      object: { type: 'Note', content: 'queued' },
    })
    const headers = buildSignatureHeaders('POST', INBOX_URL, body, keyId, privateKeyPem)
    const existingJobIds = new Set(
      (await getInboxJobs()).map(job => job.id).filter((id): id is string => id !== undefined),
    )

    await createRequest()
      .post('/ap/inbox')
      .set('Host', INBOX_HOST)
      .set('Signature', headers.signature)
      .set('Digest', headers.digest)
      .set('Date', headers.date)
      .set('Content-Type', 'application/activity+json')
      .send(body)
      .expect(202)

    const job = (await getInboxJobs()).find(
      candidate => candidate.name === 'processDelivery' && !existingJobIds.has(candidate.id ?? ''),
    )
    expect(job).toBeDefined()
    const payload = job?.data as { deliveryId: string; processingAttemptId: string } | undefined
    expect(payload).toEqual({
      deliveryId: expect.any(String),
      processingAttemptId: expect.any(String),
    })
    if (!payload) throw new Error('Expected a durable ActivityPub inbox job payload')

    const delivery = await claimTestDelivery(payload.deliveryId, payload.processingAttemptId)
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
      remoteActorId: remoteActor.id,
      verifiedAt: expect.any(Date),
      senderAllowedAt: expect.any(Date),
    })
    expect(delivery?.rawBody.equals(Buffer.from(body))).toBe(true)

    onTestFinished(async () => {
      await rejectTestDelivery(payload.deliveryId, payload.processingAttemptId)
    })
  })

  it('returns 202 after persistence without waiting for an unknown actor fetch', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
        async_delivery_enabled: true,
      }),
    )
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const unknownKeyId = `${keyId}-${randomSuffix()}`
    const activityId = `${actorUri}/activities/${randomSuffix()}`
    const body = JSON.stringify({
      id: activityId,
      type: 'Create',
      actor: actorUri,
      object: { type: 'Note', content: 'queued unknown actor' },
    })
    const headers = buildSignatureHeaders('POST', INBOX_URL, body, unknownKeyId, privateKeyPem)
    const existingJobIds = new Set(
      (await getInboxJobs()).map(job => job.id).filter((id): id is string => id !== undefined),
    )

    await createRequest()
      .post('/ap/inbox')
      .set('Host', INBOX_HOST)
      .set('Signature', headers.signature)
      .set('Digest', headers.digest)
      .set('Date', headers.date)
      .set('Content-Type', 'application/activity+json')
      .send(body)
      .expect(202)

    const job = (await getInboxJobs()).find(
      candidate => candidate.name === 'processDelivery' && !existingJobIds.has(candidate.id ?? ''),
    )
    expect(job).toBeDefined()
    const payload = job?.data as { deliveryId: string; processingAttemptId: string } | undefined
    expect(payload).toEqual({
      deliveryId: expect.any(String),
      processingAttemptId: expect.any(String),
    })
    if (!payload) throw new Error('Expected a durable ActivityPub inbox job payload')

    const delivery = await claimTestDelivery(payload.deliveryId, payload.processingAttemptId)
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
      remoteActorId: null,
      verifiedAt: null,
      senderAllowedAt: null,
    })
    expect(delivery?.rawBody.equals(Buffer.from(body))).toBe(true)

    onTestFinished(async () => {
      await rejectTestDelivery(payload.deliveryId, payload.processingAttemptId)
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
    const existingJobIds = new Set(
      (await getInboxJobs()).map(job => job.id).filter((id): id is string => id !== undefined),
    )

    await createRequest()
      .post('/ap/inbox')
      .set('Host', INBOX_HOST)
      .set('Signature', headers.signature)
      .set('Digest', headers.digest)
      .set('Date', headers.date)
      .set('Content-Type', 'application/activity+json')
      .send(body)
      .expect(401)

    const unexpectedJob = (await getInboxJobs()).find(
      candidate => candidate.name === 'processDelivery' && !existingJobIds.has(candidate.id ?? ''),
    )
    expect(unexpectedJob).toBeUndefined()
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
    const existingJobIds = new Set(
      (await getInboxJobs()).map(job => job.id).filter((id): id is string => id !== undefined),
    )

    await createRequest()
      .post('/ap/inbox')
      .set('Host', INBOX_HOST)
      .set('Signature', headers.signature)
      .set('Digest', headers.digest)
      .set('Date', headers.date)
      .set('Content-Type', 'application/activity+json')
      .send(`${body} `)
      .expect(401)

    const unexpectedJob = (await getInboxJobs()).find(
      candidate => candidate.name === 'processDelivery' && !existingJobIds.has(candidate.id ?? ''),
    )
    expect(unexpectedJob).toBeUndefined()
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
    const originalAdd = activitypubInbox.add
    activitypubInbox.add = async () => {
      throw new Error('simulated initial ActivityPub inbox enqueue failure')
    }
    onTestFinished(() => {
      activitypubInbox.add = originalAdd
    })

    const response = await createRequest()
      .post('/ap/inbox')
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

async function getInboxJobs() {
  return (
    await Promise.all(
      (['waiting', 'active', 'completed', 'failed', 'delayed'] as const).map(state =>
        activitypubInbox.getJobs(state),
      ),
    )
  ).flat()
}
