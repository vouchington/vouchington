import { describe, beforeEach, expect, it, vi } from 'vitest'
import { distributeActivity, deliverActivity } from '../processors.mts'
import {
  deliverActivityToInbox,
  type DeliverActivityToInboxInput,
} from '@services/activitypub-delivery'
import { getOrCreateActorKeyPair } from '@services/ap-actor-keys'
import { getOrFetchRemoteActorByKeyId } from '@services/remote-actors'
import { updateUserFields } from '@services/users'
import { dispatchInboundActivity } from '@services/ap-inbox-activities'
import { getEntityRelationMetadataOrThrow, upsertEntityRelation } from '@services/entity-relations'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import {
  enqueueDistributeActivity,
  type DeliverActivityData,
  type DistributeActivityData,
} from '@queues/activitypub-delivery/enqueues'
import { getActorUri, getPostUri } from '@modules/activitypub-uris'
import { generateRsaSha256KeyPair, verifySignature } from '@modules/http-signatures'
import {
  createTestPost,
  createTestUserDirect,
  readAllQueueJobs,
  waitForQueueJobs,
} from '@voucha/test-helpers'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

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

async function createFederatedUser() {
  const user = await createTestUserDirect()
  await updateUserFields(user.id, { fediverse_federation_enabled: true })
  return user
}

// Sets up a remote actor already following `userId`, the same way a real remote server's Follow
// would (through the real inbound receiver, dispatchInboundActivity) — so this file's outbound
// leg has a real relation__remote_actor__follow__user row and a real, fetched remote_actors row
// (with a real inbox_url) to fan out to, instead of hand-inserting fixture rows that bypass the
// inbound receiver entirely.
async function createRemoteFollowerOf(userId: string) {
  const hostname = `e2e-remote-${randomSuffix()}.example`
  const actorUri = `https://${hostname}/users/follower-${randomSuffix()}`
  const keyId = `${actorUri}#main-key`
  const remoteActor = await getOrFetchRemoteActorByKeyId(keyId, {
    fetchWithTimeout: vi.fn<VitestLooseMock>().mockResolvedValueOnce({
      response: makeJsonResponse({
        id: actorUri,
        inbox: `${actorUri}/inbox`,
        publicKey: {
          id: keyId,
          publicKeyPem: generateRsaSha256KeyPair().publicKeyPem,
        },
      }),
      responseSignal: new AbortController().signal,
    }),
    validateUrl: vi
      .fn<VitestLooseMock>()
      .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
  })

  await dispatchInboundActivity(remoteActor, {
    id: `${actorUri}/activities/${randomSuffix()}`,
    type: 'Follow',
    actor: remoteActor.actor_uri,
    object: getActorUri(userId),
  })

  return remoteActor
}

// Polls the real activitypub-delivery glide-mq queue (backed by real Valkey, per this repo's
// no-internal-mocks policy) for a job matching `predicate`. Mirrors
// entity-relations/upsert-origin-gating.test.mts's waitForDistributeActivityJobs, generalized to
// also read back deliverActivity jobs.
async function waitForJob<T extends { name: string; data: unknown }>(
  predicate: (job: T) => boolean,
  timeoutMs = 2000,
): Promise<T> {
  const jobs = await waitForQueueJobs(
    activitypubDelivery,
    allJobs => allJobs.some(job => predicate(job as unknown as T)),
    timeoutMs,
  )
  const match = jobs.find(job => predicate(job as unknown as T))
  if (!match) throw new Error('Timed out waiting for a matching activitypub-delivery job')
  return match as unknown as T
}

type CapturedRequest = { url: string; headers: Record<string, string>; body: string }

// Real deliverActivityToInbox (real HTTP-signature construction) with only its innermost network
// I/O stubbed — the same boundary deliver-activity.test.mts and inbox.test.mts use throughout
// this codebase. `captured` records what the real code would have sent over the wire.
function deliverToMockedNetwork(captured: CapturedRequest[]) {
  return (input: DeliverActivityToInboxInput) =>
    deliverActivityToInbox(input, {
      validateUrl: vi
        .fn<VitestLooseMock>()
        .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
      fetch: vi.fn<VitestLooseMock>(async (url: string, init: Record<string, unknown>) => {
        captured.push({
          url: url.toString(),
          headers: init.headers as Record<string, string>,
          body: init.body as string,
        })
        return new Response(null, { status: 202 })
      }),
    })
}

// Verifies a captured outbound request's HTTP Signature against `publicKeyPem`, deriving
// path/host from the captured URL the same way inbox.mts derives them from a real inbound
// request — see @modules/http-signatures's buildSignatureHeaders/verifySignature asymmetry
// (sign from a full URL, verify from separate path+host).
function verifyCapturedSignature(captured: CapturedRequest, publicKeyPem: string): boolean {
  const parsed = new URL(captured.url)
  return verifySignature(
    'POST',
    parsed.pathname + parsed.search,
    parsed.host,
    captured.body,
    captured.headers.signature!,
    captured.headers.digest!,
    captured.headers.date!,
    publicKeyPem,
  ).valid
}

// Phase C6: exercises the real outbound chain end to end — a local Follow/Like production write
// -> the real glide-mq activitypub-delivery queue -> the real distributeActivity processor
// (real DB read of the acting user's remote followers) -> the real deliverActivity processor
// (real HTTP-signature construction) -> a signature verifiable against the sending user's real
// actor keypair. Only the actual network socket is stubbed; every other layer is production code.
describe('ActivityPub outbound round trip (Phase C6)', () => {
  // Jobs enqueued in this suite are inspected directly, never consumed by a real worker, so they
  // would otherwise accumulate as permanent 'waiting' entries across runs — mirrors
  // entity-relations/upsert-origin-gating.test.mts's beforeEach isolation.
  beforeEach(async () => {
    await activitypubDelivery.obliterate({ force: true })
  })

  // Phase C6 loop prevention, at the real inbound-receiver entry point rather than the
  // entity-relations origin-gate in isolation (already covered by
  // entity-relations/upsert-origin-gating.test.mts and delete-origin-gating.test.mts): a Follow
  // delivered through dispatchInboundActivity — the actual function the /ap/inbox route calls —
  // must not itself enqueue an outbound distribution, or a remote server's Follow would bounce
  // back out as if it were a local action, forever.
  it('a Follow received through the real inbound receiver does not itself enqueue outbound distribution', async () => {
    const targetUser = await createFederatedUser()

    await createRemoteFollowerOf(targetUser.id)

    const jobs = await readAllQueueJobs(activitypubDelivery)
    expect(jobs.some(job => job.name === 'distributeActivity')).toBe(false)
  })

  it('a local Follow write fans out to the acting user’s remote followers with a verifiable signature', async () => {
    const sourceUser = await createFederatedUser()
    // The target must also be opted into federation, or distributeActivity's target-gate (mirrors
    // the inbound-Follow and GET /ap/users/:id gates) would correctly suppress this Follow.
    const followee = await createFederatedUser()
    const remoteFollower = await createRemoteFollowerOf(sourceUser.id)
    const { public_key_pem: sourcePublicKeyPem } = await getOrCreateActorKeyPair(sourceUser.id)

    const followMetadata = getEntityRelationMetadataOrThrow({
      subjectType: 'user',
      objectType: 'user',
      predicate: 'follow',
    })
    // The real production trigger site (entity-relations/upsert.mts): a local user->user follow
    // enqueues an outbound Follow distribution for the follower's own remote audience.
    await upsertEntityRelation(sourceUser, followMetadata, sourceUser, [followee])

    const distributeJob = await waitForJob<{ name: string; data: DistributeActivityData }>(
      job =>
        job.name === 'distributeActivity' &&
        job.data.activityType === 'Follow' &&
        job.data.sourceUserId === sourceUser.id,
    )
    const distributeResult = await distributeActivity(distributeJob.data)
    expect(distributeResult.enqueued).toBeGreaterThan(0)

    const deliverJob = await waitForJob<{ name: string; data: DeliverActivityData }>(
      job =>
        job.name === 'deliverActivity' && job.data.activityId === distributeJob.data.activityId,
    )
    const captured: CapturedRequest[] = []
    const deliverResult = await deliverActivity(deliverJob.data, {
      deliverActivityToInbox: deliverToMockedNetwork(captured),
    })

    expect(deliverResult).toEqual({ delivered: true })
    expect(captured).toHaveLength(1)
    expect(captured[0]!.url).toBe(remoteFollower.inbox_url)
    expect(verifyCapturedSignature(captured[0]!, sourcePublicKeyPem)).toBe(true)
    expect(JSON.parse(captured[0]!.body)).toMatchObject({
      type: 'Follow',
      actor: getActorUri(sourceUser.id),
      object: getActorUri(followee.id),
    })
  })

  it('a local Like write fans out to the acting user’s remote followers with a verifiable signature', async () => {
    const sourceUser = await createFederatedUser()
    const post = await createTestPost()
    const remoteFollower = await createRemoteFollowerOf(sourceUser.id)
    const { public_key_pem: sourcePublicKeyPem } = await getOrCreateActorKeyPair(sourceUser.id)

    // The real production trigger call (posts/post-routes/comment-ancestors-route.mts's onVote):
    // an upvote on a post enqueues an outbound Like distribution for the voter's remote audience.
    await enqueueDistributeActivity({
      activityId: post.id,
      activityType: 'Like',
      sourceUserId: sourceUser.id,
      targetPostId: post.id,
    })

    const distributeJob = await waitForJob<{ name: string; data: DistributeActivityData }>(
      job =>
        job.name === 'distributeActivity' &&
        job.data.activityType === 'Like' &&
        job.data.sourceUserId === sourceUser.id,
    )
    const distributeResult = await distributeActivity(distributeJob.data)
    expect(distributeResult.enqueued).toBeGreaterThan(0)

    const deliverJob = await waitForJob<{ name: string; data: DeliverActivityData }>(
      job =>
        job.name === 'deliverActivity' && job.data.activityId === distributeJob.data.activityId,
    )
    const captured: CapturedRequest[] = []
    const deliverResult = await deliverActivity(deliverJob.data, {
      deliverActivityToInbox: deliverToMockedNetwork(captured),
    })

    expect(deliverResult).toEqual({ delivered: true })
    expect(captured).toHaveLength(1)
    expect(captured[0]!.url).toBe(remoteFollower.inbox_url)
    expect(verifyCapturedSignature(captured[0]!, sourcePublicKeyPem)).toBe(true)
    expect(JSON.parse(captured[0]!.body)).toMatchObject({
      type: 'Like',
      actor: getActorUri(sourceUser.id),
      object: getPostUri(post.id),
    })
  })
})
