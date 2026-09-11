import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSignatureHeaders, generateRsaSha256KeyPair } from '@modules/http-signatures'
import { activitypubInbox } from '@queues/activitypub-inbox/queues'
import { activityPubInboxConfig } from '@services/ap-inbox-activities'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertApprovedTestFediverseInstance,
  resetActivityPubInboxDeliveryStorageForTest,
  setActivityPubInboxStorageCountersForTest,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createRemoteActorFixture, randomSuffix } from './inbox.test-helpers.mts'

const INBOX_HOST = 'inbox-capacity-test.example'
const INBOX_URL = `http://${INBOX_HOST}/ap/inbox`
let restoreWorkerConfig: () => void = () => undefined

describe('POST /ap/inbox capacity handling', () => {
  beforeEach(async () => {
    await resetActivityPubInboxDeliveryStorageForTest()
    await activitypubInbox.obliterate({ force: true })
    restoreWorkerConfig = overrideDynamicConfigFieldsForTest(activityPubInboxConfig, {
      async_delivery_enabled: true,
    })
  })
  afterEach(async () => {
    restoreWorkerConfig()
    await resetActivityPubInboxDeliveryStorageForTest()
    await activitypubInbox.obliterate({ force: true })
  })

  it('returns 503 with Retry-After 300 and creates no job when unverified storage is full', async () => {
    await setActivityPubInboxStorageCountersForTest(10_000, 0)
    const { request } = await unknownActorRequest()

    const response = await request.expect(503)

    expect(response.headers['retry-after']).toBe('300')
    expect(await activitypubInbox.getJobs('waiting')).toHaveLength(0)
  })

  it('maps only the named PostgreSQL capacity violation to 503', async () => {
    await resetActivityPubInboxDeliveryStorageForTest({ removeCounterSingleton: true })

    const { request } = await unknownActorRequest()
    const response = await request.expect(500)

    expect(response.headers['retry-after']).toBeUndefined()
    expect(await activitypubInbox.getJobs('waiting')).toHaveLength(0)
  })

  it('allows a cached verified signer to bypass the unverified capacity cap', async () => {
    await setActivityPubInboxStorageCountersForTest(10_000, 0)
    const { actorUri, keyId, privateKeyPem } = await createRemoteActorFixture()

    const response = await signedRequest(actorUri, keyId, privateKeyPem).expect(202)

    expect(response.headers['retry-after']).toBeUndefined()
    expect(await activitypubInbox.getJobs('waiting')).toHaveLength(1)
  })
})

async function unknownActorRequest() {
  const hostname = `capacity-${randomSuffix()}.example`
  await insertApprovedTestFediverseInstance(hostname)
  const actorUri = `https://${hostname}/users/alice`
  const { privateKeyPem } = generateRsaSha256KeyPair()
  return { request: signedRequest(actorUri, `${actorUri}#unknown-key`, privateKeyPem) }
}

function signedRequest(actorUri: string, keyId: string, privateKeyPem: string) {
  const body = JSON.stringify({
    id: `${actorUri}/activities/${randomSuffix()}`,
    type: 'Create',
    actor: actorUri,
    object: { type: 'Note', content: 'capacity boundary' },
  })
  const headers = buildSignatureHeaders('POST', INBOX_URL, body, keyId, privateKeyPem)
  return createRequest()
    .post('/ap/inbox')
    .set('Host', INBOX_HOST)
    .set('Signature', headers.signature)
    .set('Digest', headers.digest)
    .set('Date', headers.date)
    .set('Content-Type', 'application/activity+json')
    .send(body)
}
