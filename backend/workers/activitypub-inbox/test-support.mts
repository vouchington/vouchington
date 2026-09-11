import { randomUUID } from 'node:crypto'
import { buildSignatureHeaders, generateRsaSha256KeyPair } from '@modules/http-signatures'
import {
  activityPubInboxDeliveryTransitions,
  type ActivityPubInboxEnvelope,
} from '@services/ap-inbox-activities'
import { getOrFetchRemoteActorByKeyId } from '@services/remote-actors'
import { insertApprovedTestFediverseInstance as approveInstance } from '@voucha/test-helpers'

export { approveInstance }

const EXPECTED_HOST = 'voucha.example'
const REQUEST_URL = `https://${EXPECTED_HOST}/ap/inbox`

type ActorFixture = {
  remoteActorId?: string
  actorUri: string
  hostname: string
  keyId: string
  privateKeyPem: string
}

export async function createApprovedRemoteActor(): Promise<ActorFixture> {
  const hostname = `remote-${randomUUID()}.example`
  await approveInstance(hostname)
  const actorUri = `https://${hostname}/users/alice`
  const keyId = `${actorUri}#main-key`
  const { privateKeyPem, publicKeyPem } = generateRsaSha256KeyPair()
  const remoteActor = await getOrFetchRemoteActorByKeyId(keyId, {
    validateUrl: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchWithTimeout: async () => ({
      response: new Response(
        JSON.stringify({
          id: actorUri,
          inbox: `${actorUri}/inbox`,
          publicKey: { id: keyId, publicKeyPem },
        }),
        { status: 200 },
      ),
      responseSignal: new AbortController().signal,
    }),
  })
  return { remoteActorId: remoteActor.id, actorUri, hostname, keyId, privateKeyPem }
}

export function makeUnavailableActor(): ActorFixture {
  const hostname = `missing-${randomUUID()}.invalid`
  const actorUri = `https://${hostname}/users/alice`
  const { privateKeyPem } = generateRsaSha256KeyPair()
  return {
    remoteActorId: randomUUID(),
    actorUri,
    hostname,
    keyId: `${actorUri}#main-key`,
    privateKeyPem,
  }
}

export async function createSignedDelivery(
  actor: ActorFixture,
  options: {
    activityId?: string
    claimedActorUri?: string
    corruptSignature?: boolean
  } = {},
) {
  const activityId = options.activityId ?? `${actor.actorUri}/activities/${randomUUID()}`
  const claimedActorUri = options.claimedActorUri ?? actor.actorUri
  const body = JSON.stringify({
    id: activityId,
    type: 'Create',
    actor: claimedActorUri,
    object: { type: 'Note' },
  })
  const headers = buildSignatureHeaders('POST', REQUEST_URL, body, actor.keyId, actor.privateKeyPem)
  const envelope: ActivityPubInboxEnvelope = {
    requestMethod: 'POST',
    requestTarget: '/ap/inbox',
    expectedHost: EXPECTED_HOST,
    signatureHeader: options.corruptSignature
      ? headers.signature.replace(/signature="[^"]+"/, 'signature="AAAA"')
      : headers.signature,
    digestHeader: headers.digest,
    dateHeader: headers.date,
    contentTypeHeader: 'application/activity+json',
    rawBody: Buffer.from(body),
    claimedActivityId: activityId,
    claimedActivityType: 'Create',
    claimedActorUri,
    senderHostname: actor.hostname,
  }
  const result = await activityPubInboxDeliveryTransitions.accept(envelope)
  if (result.outcome !== 'applied') throw new Error('Test delivery unexpectedly exceeded capacity')
  return result.value
}
