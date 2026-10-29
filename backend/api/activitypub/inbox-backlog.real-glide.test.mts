import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq/glide-mq-shared-client'
import { activityPubInboxReservationKey } from '@data-stores/valkey-glide-mq/activitypub-inbox-reservations'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { failNextOwnedActivityPubInboxEnqueue } from '@voucha/test-helpers/activitypub-inbox-enqueue-failure'
import { postInbox, signInboxRequest } from '@voucha/test-helpers/activitypub-inbox-api-requests'
import {
  createRemoteActorFixture,
  randomSuffix,
} from '@voucha/test-helpers/api/activitypub/inbox.fixtures'
import {
  findActivityPubInboxJobsForRequestDigest,
  removeActivityPubInboxJobForRequestDigest,
} from '@voucha/test-helpers/activitypub-inbox-test-jobs'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES,
  createActivityPubInboxDeliveryJob,
} from '@services/ap-inbox-activities'
import { remoteActorsWorkConfig } from '@services/remote-actors/work-limits'

// The route uses the production queue name. Give this file its own native queue prefix so
// unrelated tests cannot change its exact reservation count.
vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

function signedDelivery(actorUri: string, keyId: string, privateKeyPem: string, hostname: string) {
  const body = JSON.stringify({
    id: `${actorUri}/activities/${randomSuffix()}`,
    type: 'Create',
    actor: actorUri,
    object: { type: 'Note', content: 'backlog admission' },
  })
  const signed = signInboxRequest(body, keyId, privateKeyPem)
  const delivery = createActivityPubInboxDeliveryJob({
    requestMethod: 'POST',
    requestTarget: '/ap/inbox',
    expectedHost: 'inbox-test.example',
    signatureHeader: signed.signature,
    digestHeader: signed.digest,
    dateHeader: signed.date,
    contentTypeHeader: 'application/activity+json',
    rawBody: Buffer.from(body),
    senderHostname: hostname,
  })
  return { body, signed, requestDigest: delivery.requestDigest }
}

describe('POST /ap/inbox native reservation admission', () => {
  it('admits below the cap and returns 503 without a queued job when full', async () => {
    const { actorUri, keyId, privateKeyPem, hostname } = await createRemoteActorFixture()
    const accepted = signedDelivery(actorUri, keyId, privateKeyPem, hostname)
    const rejected = signedDelivery(actorUri, keyId, privateKeyPem, hostname)
    const reservationKey = activityPubInboxReservationKey(BACKGROUND_QUEUE_NAME)
    onTestFinished(async () => {
      await removeActivityPubInboxJobForRequestDigest(accepted.requestDigest)
      await removeActivityPubInboxJobForRequestDigest(rejected.requestDigest)
      await workerQueueCommandClient.unlink([reservationKey])
    })
    onTestFinished(
      overrideDynamicConfigFieldsForTest(remoteActorsWorkConfig, { inbound_backlog_cap: 1 }),
    )

    await postInbox(accepted.signed).send(accepted.body).expect(202)
    expect(await findActivityPubInboxJobsForRequestDigest(accepted.requestDigest)).toHaveLength(1)
    expect(await workerQueueCommandClient.zcard(reservationKey)).toBe(1)

    const response = await postInbox(rejected.signed).send(rejected.body).expect(503)
    expect(response.headers['retry-after']).toBe('60')
    expect(await findActivityPubInboxJobsForRequestDigest(rejected.requestDigest)).toHaveLength(0)
    expect(await workerQueueCommandClient.zcard(reservationKey)).toBe(1)

    const oversizedBody = rejected.body + ' '.repeat(ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES)
    await postInbox(signInboxRequest(oversizedBody, keyId, privateKeyPem))
      .send(oversizedBody)
      .expect(413)
    expect(await workerQueueCommandClient.zcard(reservationKey)).toBe(1)
  })

  it('releases a reservation when native enqueue fails before admission', async () => {
    const { actorUri, keyId, privateKeyPem, hostname } = await createRemoteActorFixture()
    const failed = signedDelivery(actorUri, keyId, privateKeyPem, hostname)
    const retried = signedDelivery(actorUri, keyId, privateKeyPem, hostname)
    const reservationKey = activityPubInboxReservationKey(BACKGROUND_QUEUE_NAME)
    onTestFinished(async () => {
      await removeActivityPubInboxJobForRequestDigest(failed.requestDigest)
      await removeActivityPubInboxJobForRequestDigest(retried.requestDigest)
      await workerQueueCommandClient.unlink([reservationKey])
    })
    onTestFinished(
      overrideDynamicConfigFieldsForTest(remoteActorsWorkConfig, { inbound_backlog_cap: 1 }),
    )

    const requestId = randomUUID()
    failNextOwnedActivityPubInboxEnqueue(requestId)
    await postInbox(failed.signed).set('x-request-id', requestId).send(failed.body).expect(500)
    expect(await findActivityPubInboxJobsForRequestDigest(failed.requestDigest)).toHaveLength(0)
    expect(await workerQueueCommandClient.zcard(reservationKey)).toBe(0)

    await postInbox(retried.signed).send(retried.body).expect(202)
    expect(await findActivityPubInboxJobsForRequestDigest(retried.requestDigest)).toHaveLength(1)
    expect(await workerQueueCommandClient.zcard(reservationKey)).toBe(1)
  })

  it('releases the second reservation when native digest dedup skips a replay', async () => {
    const { actorUri, keyId, privateKeyPem, hostname } = await createRemoteActorFixture()
    const replayed = signedDelivery(actorUri, keyId, privateKeyPem, hostname)
    const reservationKey = activityPubInboxReservationKey(BACKGROUND_QUEUE_NAME)
    onTestFinished(async () => {
      await removeActivityPubInboxJobForRequestDigest(replayed.requestDigest)
      await workerQueueCommandClient.unlink([reservationKey])
    })
    onTestFinished(
      overrideDynamicConfigFieldsForTest(remoteActorsWorkConfig, { inbound_backlog_cap: 2 }),
    )

    await postInbox(replayed.signed).send(replayed.body).expect(202)
    await postInbox(replayed.signed).send(replayed.body).expect(202)
    expect(await findActivityPubInboxJobsForRequestDigest(replayed.requestDigest)).toHaveLength(1)
    expect(await workerQueueCommandClient.zcard(reservationKey)).toBe(1)
  })

  it('fails closed without enqueuing when the owned reservation key has the wrong type', async () => {
    const { actorUri, keyId, privateKeyPem, hostname } = await createRemoteActorFixture()
    const delivery = signedDelivery(actorUri, keyId, privateKeyPem, hostname)
    const reservationKey = activityPubInboxReservationKey(BACKGROUND_QUEUE_NAME)
    onTestFinished(async () => {
      await workerQueueCommandClient.unlink([reservationKey])
      await removeActivityPubInboxJobForRequestDigest(delivery.requestDigest)
    })
    await workerQueueCommandClient.set(reservationKey, 'not-a-sorted-set')

    const response = await postInbox(delivery.signed).send(delivery.body).expect(503)
    expect(response.headers['retry-after']).toBe('60')
    expect(await findActivityPubInboxJobsForRequestDigest(delivery.requestDigest)).toHaveLength(0)
  })
})
