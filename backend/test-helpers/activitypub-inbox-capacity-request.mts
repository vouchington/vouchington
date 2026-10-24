import type { Response } from 'supertest'
import { randomUUID } from 'node:crypto'
import { buildSignatureHeaders, generateRsaSha256KeyPair } from '@modules/http-signatures'
import { createRequest } from './api/server.mts'
import { createRemoteActorFixture } from './api/activitypub/inbox.fixtures.mts'
import { insertApprovedTestFediverseInstance } from './entities/fediverse-instances.mts'

const HOST = 'inbox-capacity-test.example'

export async function createActivityPubCapacityRequest(
  verified: boolean,
): Promise<{ activityId: string; requestId: string; send: () => Promise<Response> }> {
  const actor = verified ? await createRemoteActorFixture() : await createUnknownActor()
  const activityId = `${actor.actorUri}/activities/${randomUUID()}`
  const requestId = randomUUID()
  const body = JSON.stringify({
    id: activityId,
    type: 'Create',
    actor: actor.actorUri,
    object: { type: 'Note', content: 'capacity boundary' },
  })
  const headers = buildSignatureHeaders(
    'POST',
    `http://${HOST}/ap/inbox`,
    body,
    actor.keyId,
    actor.privateKeyPem,
  )
  return {
    activityId,
    requestId,
    send: async () =>
      createRequest()
        .post('/ap/inbox')
        .set('Host', HOST)
        .set('x-request-id', requestId)
        .set('Signature', headers.signature)
        .set('Digest', headers.digest)
        .set('Date', headers.date)
        .set('Content-Type', 'application/activity+json')
        .send(body),
  }
}

async function createUnknownActor() {
  const hostname = `capacity-${randomUUID()}.example`
  await insertApprovedTestFediverseInstance(hostname)
  const actorUri = `https://${hostname}/users/alice`
  return { actorUri, keyId: `${actorUri}#unknown-key`, ...generateRsaSha256KeyPair() }
}
