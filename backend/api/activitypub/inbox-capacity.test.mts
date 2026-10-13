import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSignatureHeaders, generateRsaSha256KeyPair } from '@modules/http-signatures'
import { activitypub } from '@queues/activitypub/queues'
import { activityPubInboxConfig } from '@services/ap-inbox-activities'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  activityPubInboxDeliveryExistsOnPrimaryForTest,
  getActivityPubInboxDeliveryIdForTest,
  insertApprovedTestFediverseInstance,
  resetActivityPubInboxDeliveryStorageForTest,
  setActivityPubInboxStorageCountersForTest,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createRemoteActorFixture,
  randomSuffix,
} from '@voucha/test-helpers/api/activitypub/inbox.fixtures'

const INBOX_HOST = 'inbox-capacity-test.example'
const INBOX_URL = `http://${INBOX_HOST}/ap/inbox`
let restoreWorkerConfig: () => void = () => undefined

// Inbox jobs are prioritized, so the accepted request reads its durable delivery ID before
// looking up and removing only that job from the shared queue.
describe('POST /ap/inbox capacity handling', () => {
  beforeEach(async () => {
    await resetActivityPubInboxDeliveryStorageForTest()
    restoreWorkerConfig = overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
      async_delivery_enabled: true,
    })
  })
  afterEach(async () => {
    restoreWorkerConfig()
    await resetActivityPubInboxDeliveryStorageForTest()
  })

  it('returns 503 with Retry-After 300 without persisting a delivery when unverified storage is full', async () => {
    await setActivityPubInboxStorageCountersForTest(10_000, 0)
    const { request, activityId } = await unknownActorRequest()

    const response = await request.expect(503)

    expect(response.headers['retry-after']).toBe('300')
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(activityId)).toBe(false)
  })

  it('maps only the named PostgreSQL capacity violation to 503', async () => {
    await resetActivityPubInboxDeliveryStorageForTest({ removeCounterSingleton: true })

    const { request, activityId } = await unknownActorRequest()
    const response = await request.expect(500)

    expect(response.headers['retry-after']).toBeUndefined()
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(activityId)).toBe(false)
  })

  it('allows a cached verified signer to bypass the unverified capacity cap', async () => {
    await setActivityPubInboxStorageCountersForTest(10_000, 0)
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()
    const { request, activityId } = signedRequest(actorUri, keyId, privateKeyPem)
    const response = await request.expect(202)

    expect(response.headers['retry-after']).toBeUndefined()
    const deliveryId = await getActivityPubInboxDeliveryIdForTest(activityId)
    expect(deliveryId).toBeDefined()
    const jobs = (await activitypub.searchJobs({ name: 'processDelivery' })).filter(
      job => (job.data as { deliveryId?: string }).deliveryId === deliveryId,
    )
    try {
      expect(jobs).toHaveLength(1)
    } finally {
      await Promise.all(jobs.map(job => job.remove()))
    }
  })
})

async function unknownActorRequest() {
  const hostname = `capacity-${randomSuffix()}.example`
  await insertApprovedTestFediverseInstance(hostname)
  const actorUri = `https://${hostname}/users/alice`
  const { privateKeyPem } = generateRsaSha256KeyPair()
  return signedRequest(actorUri, `${actorUri}#unknown-key`, privateKeyPem)
}

function signedRequest(actorUri: string, keyId: string, privateKeyPem: string) {
  const activityId = `${actorUri}/activities/${randomSuffix()}`
  const body = JSON.stringify({
    id: activityId,
    type: 'Create',
    actor: actorUri,
    object: { type: 'Note', content: 'capacity boundary' },
  })
  const headers = buildSignatureHeaders('POST', INBOX_URL, body, keyId, privateKeyPem)
  const request = createRequest()
    .post('/ap/inbox')
    .set('Host', INBOX_HOST)
    .set('Signature', headers.signature)
    .set('Digest', headers.digest)
    .set('Date', headers.date)
    .set('Content-Type', 'application/activity+json')
    .send(body)
  return { request, activityId }
}
