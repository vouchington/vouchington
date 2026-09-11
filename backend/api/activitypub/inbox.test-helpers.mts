import { vi } from 'vitest'
import {
  createTestUserDirect,
  insertTestFediverseInstanceExtension,
  insertTestFediverseInstanceIntegrationChange,
  insertTestTopic,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import { getOrFetchRemoteActorByKeyId, type RemoteActorRow } from '@services/remote-actors'

export const randomSuffix = () => Math.random().toString(36).slice(2, 10)

function makeJsonResponse(body: unknown): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(body))
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

export async function approveFediverseInstance(hostname: string): Promise<void> {
  const user = await createTestUserDirect()
  const hostnameId = await insertTestUrlHostname({ hostname })
  const suffix = randomSuffix()
  const topicId = await insertTestTopic({
    name: `Inbox Test Instance ${suffix}`,
    slug: `inbox-test-instance-${suffix}`,
    createdById: user.id,
    topicType: 'fediverse_instance',
    hostnameId,
  })
  await configureApprovedFediverseInstance(topicId)
}

async function configureApprovedFediverseInstance(topicId: string): Promise<void> {
  await insertTestFediverseInstanceExtension({ topicId, software: 'mastodon' })
  await insertTestFediverseInstanceIntegrationChange({ topicId, integrationStatus: 'approved' })
}

type UnapprovedRemoteActorFixture = {
  hostname: string
  actorUri: string
  keyId: string
  privateKeyPem: string
}

type ApprovedRemoteActorFixture = UnapprovedRemoteActorFixture & {
  remoteActor: RemoteActorRow
}

export async function createRemoteActorFixture(options: {
  approved: false
}): Promise<UnapprovedRemoteActorFixture>
export async function createRemoteActorFixture(options?: {
  approved?: true
}): Promise<ApprovedRemoteActorFixture>
export async function createRemoteActorFixture(
  options: { approved?: boolean } = {},
): Promise<UnapprovedRemoteActorFixture | ApprovedRemoteActorFixture> {
  const { approved = true } = options
  const suffix = randomSuffix()
  const hostname = `remote-${suffix}.example`
  if (approved) await approveFediverseInstance(hostname)

  const actorUri = `https://${hostname}/users/actor-${suffix}`
  const keyId = `${actorUri}#main-key`
  const { publicKeyPem, privateKeyPem } = generateRsaSha256KeyPair()

  if (!approved) return { hostname, actorUri, keyId, privateKeyPem }

  const fetchWithTimeout = vi.fn<VitestLooseMock>().mockResolvedValueOnce({
    response: makeJsonResponse({
      id: actorUri,
      inbox: `${actorUri}/inbox`,
      publicKey: { id: keyId, publicKeyPem },
    }),
    responseSignal: new AbortController().signal,
  })
  const validateUrl = vi
    .fn<VitestLooseMock>()
    .mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  const remoteActor = await getOrFetchRemoteActorByKeyId(keyId, { fetchWithTimeout, validateUrl })

  return { hostname, actorUri, keyId, privateKeyPem, remoteActor }
}
