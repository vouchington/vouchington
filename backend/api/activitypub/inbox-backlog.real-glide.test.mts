import { describe, expect, it, onTestFinished } from 'vitest'
import { getOrderingLanePendingCount } from '@data-stores/valkey-glide-mq/ordering-lane-pending-count'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { enqueueActivityPubInboxDelivery } from '@queues/activitypub/enqueues/inbox'
import { backgroundQueue } from '@voucha/test-helpers/shared-background-queue'
import { postInbox, signInboxRequest } from '@voucha/test-helpers/activitypub-inbox-api-requests'
import {
  createRemoteActorFixture,
  randomSuffix,
} from '@voucha/test-helpers/api/activitypub/inbox.fixtures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createActivityPubInboxDeliveryJob } from '@services/ap-inbox-activities'
import { remoteActorsWorkConfig } from '@services/remote-actors/work-limits'

function signedDelivery(
  actorUri: string,
  keyId: string,
  privateKeyPem: string,
  senderHostname: string,
) {
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
    senderHostname,
  })
  return { body, signed, delivery, jobId: `activitypub-inbox__${delivery.requestDigest}` }
}

describe('POST /ap/inbox native backlog admission', () => {
  it('returns 503 without enqueue when an owned job fills the inbound lane', async () => {
    const { actorUri, keyId, privateKeyPem, hostname } = await createRemoteActorFixture()
    const queued = signedDelivery(actorUri, keyId, privateKeyPem, hostname)
    const rejected = signedDelivery(actorUri, keyId, privateKeyPem, hostname)
    onTestFinished(async () => {
      await (await backgroundQueue.getJob(queued.jobId))?.remove()
      await (await backgroundQueue.getJob(rejected.jobId))?.remove()
    })
    await enqueueActivityPubInboxDelivery(queued.delivery)
    expect(await backgroundQueue.getJob(queued.jobId)).toBeTruthy()
    expect(
      await getOrderingLanePendingCount(BACKGROUND_QUEUE_NAME, 'activitypub:inbound'),
    ).toBeGreaterThanOrEqual(1)

    const restoreLowCap = overrideDynamicConfigFieldsForTest(remoteActorsWorkConfig, {
      inbound_backlog_cap: 1,
    })
    onTestFinished(restoreLowCap)
    const response = await postInbox(rejected.signed).send(rejected.body).expect(503)
    expect(response.headers['retry-after']).toBe('60')
    expect(await backgroundQueue.getJob(rejected.jobId)).toBeFalsy()
  })
})
