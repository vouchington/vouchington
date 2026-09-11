import { describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestPost,
  createTestUserDirect,
  insertTestFediverseInstanceExtension,
  insertTestFediverseInstanceIntegrationChange,
  insertTestTopic,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { updateUserFields } from '@services/users'
import { getOrFetchRemoteActorByKeyId } from '@services/remote-actors'
import { getEntityRelations } from '@services/entity-relations'
import { getApPostLikesTally } from '@services/ap-post-likes'
import { getActorUri, getPostUri, getWebfingerAcct } from '@modules/activitypub-uris'
import { buildSignatureHeaders, generateRsaSha256KeyPair } from '@modules/http-signatures'
import { getSiteOrigin } from '@modules/utils'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)
const ourHostname = new URL(getSiteOrigin()).hostname

function makeJsonResponse(body: unknown, status = 200): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(body))
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  return new Response(stream, { status })
}

async function approveFediverseInstance(hostname: string): Promise<void> {
  const user = await createTestUserDirect()
  const hostnameId = await insertTestUrlHostname({ hostname })
  const suffix = randomSuffix()
  const topicId = await insertTestTopic({
    name: `E2E Round Trip Instance ${suffix}`,
    slug: `e2e-round-trip-instance-${suffix}`,
    createdById: user.id,
    topicType: 'fediverse_instance',
    hostnameId,
  })
  await insertTestFediverseInstanceExtension({ topicId, software: 'mastodon' })
  await insertTestFediverseInstanceIntegrationChange({ topicId, integrationStatus: 'approved' })
}

async function createFederatedUser() {
  const user = await createTestUserDirect()
  await updateUserFields(user.id, { fediverse_federation_enabled: true })
  return user
}

// Signs and delivers `body` to `inboxUrl` (a value discovered from a real actor document earlier
// in the same test, never hardcoded) through the real HTTP inbox route — mirrors inbox.test.mts's
// signInboxRequest/postInbox pair, collapsed into one call since every activity in this file is
// delivered to the same discovered inbox.
function deliverSignedActivity(
  inboxUrl: string,
  body: string,
  keyId: string,
  privateKeyPem: string,
) {
  const signature = buildSignatureHeaders('POST', inboxUrl, body, keyId, privateKeyPem)
  const parsedInbox = new URL(inboxUrl)
  return createRequest()
    .post(parsedInbox.pathname)
    .set('Host', parsedInbox.host)
    .set('Signature', signature.signature)
    .set('Digest', signature.digest)
    .set('Date', signature.date)
    .set('Content-Type', 'application/activity+json')
    .send(body)
}

// Phase C6: exercises the real inbound discovery + delivery chain end to end — NodeInfo ->
// WebFinger -> actor document -> signature-verified inbox POST -> write-path — rather than any
// single layer in isolation. Every value used to reach the next step (the NodeInfo href, the
// WebFinger-resolved actor URI, the actor document's advertised inbox) is read from the previous
// step's real HTTP response, never hardcoded to the route shape a unit test would assume.
describe('ActivityPub inbound round trip (Phase C6)', () => {
  it('a remote actor discovers a Voucha user via NodeInfo -> WebFinger -> actor document, then follows and likes through the signature-verified inbox', async () => {
    const hostname = `e2e-remote-${randomSuffix()}.example`
    await approveFediverseInstance(hostname)
    const targetUser = await createFederatedUser()
    const post = await createTestPost()
    const request = createRequest()

    // 1. NodeInfo discovery: /.well-known/nodeinfo advertises the schema document's real href.
    const discovery = await request.get('/.well-known/nodeinfo').expect(200)
    const schemaLink = (discovery.body.links as Array<{ rel: string; href: string }>).find(
      link => link.rel === 'http://nodeinfo.diaspora.software/ns/schema/2.0',
    )
    expect(schemaLink).toBeDefined()
    const nodeinfoDoc = await request.get(new URL(schemaLink!.href).pathname).expect(200)
    expect(nodeinfoDoc.body.protocols).toEqual(['activitypub'])

    // 2. WebFinger resolution: acct:<username>@<hostname> -> the user's real actor URI.
    const webfinger = await request
      .get('/.well-known/webfinger')
      .query({ resource: getWebfingerAcct(targetUser.username!) })
      .expect(200)
    expect(webfinger.body.subject).toBe(getWebfingerAcct(targetUser.username!))
    const actorUri = (webfinger.body.links as Array<{ href: string }>)[0]!.href
    expect(actorUri).toBe(getActorUri(targetUser.id))

    // 3. Actor document fetch: resolves the inbox URL a real remote server would deliver to.
    const actorDoc = await request.get(new URL(actorUri).pathname).expect(200)
    expect(actorDoc.body.id).toBe(actorUri)
    const inboxUrl: string = actorDoc.body.inbox
    expect(new URL(inboxUrl).hostname).toBe(ourHostname)

    // The remote actor's own keypair and document — getOrFetchRemoteActorByKeyId is the same
    // production discovery path the inbox route itself calls on first sight of this keyId; its
    // own outbound fetch/SSRF-validate is stubbed here only because there is no live remote
    // server for this suite to fetch from (same boundary inbox.test.mts uses).
    const { publicKeyPem, privateKeyPem } = generateRsaSha256KeyPair()
    const remoteActorUri = `https://${hostname}/users/remote-${randomSuffix()}`
    const keyId = `${remoteActorUri}#main-key`
    const remoteActor = await getOrFetchRemoteActorByKeyId(keyId, {
      fetchWithTimeout: vi.fn<VitestLooseMock>().mockResolvedValueOnce({
        response: makeJsonResponse({
          id: remoteActorUri,
          inbox: `${remoteActorUri}/inbox`,
          publicKey: { id: keyId, publicKeyPem },
        }),
        responseSignal: new AbortController().signal,
      }),
      validateUrl: vi
        .fn<VitestLooseMock>()
        .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
    })

    // 4. Signed Follow, delivered to the inbox URL discovered from the actor document in step 3.
    const followBody = JSON.stringify({
      id: `${remoteActorUri}/activities/${randomSuffix()}`,
      type: 'Follow',
      actor: remoteActorUri,
      object: actorUri,
    })
    await deliverSignedActivity(inboxUrl, followBody, keyId, privateKeyPem).expect(202)

    const relations = await getEntityRelations('remote_actor', remoteActor.id, 'follow', 'user')
    expect(relations.some(relation => relation.object_id === targetUser.id)).toBe(true)

    // 5. Signed Like, delivered to the same discovered inbox (shared inbox, per actor.mts).
    const likeBody = JSON.stringify({
      id: `${remoteActorUri}/activities/${randomSuffix()}`,
      type: 'Like',
      actor: remoteActorUri,
      object: getPostUri(post.id),
    })
    await deliverSignedActivity(inboxUrl, likeBody, keyId, privateKeyPem).expect(202)

    expect(await getApPostLikesTally(post.id)).toEqual({ ap_likes_score: 1, ap_likes_count: 1 })
  })
})
