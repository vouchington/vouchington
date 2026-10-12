import { QueueEvents, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { distributeActivity, deliverActivity } from '../processors/delivery.mts'
import {
  deliverActivityToInbox,
  type DeliverActivityToInboxInput,
} from '@services/activitypub-delivery'
import { getOrCreateActorKeyPair } from '@services/ap-actor-keys'
import '@services/bookmarks'
import { getOrFetchRemoteActorByKeyId } from '@services/remote-actors'
import { updateUserFields } from '@services/users'
import { dispatchInboundActivity } from '@services/ap-inbox-activities'
import { getEntityRelationMetadataOrThrow, upsertEntityRelation } from '@services/entity-relations'
import { activitypub } from '@queues/activitypub/queues'
import {
  enqueueDistributeActivity,
  type DeliverActivityData,
  type DistributeActivityData,
} from '@queues/activitypub/enqueues/delivery'
import { getActorUri, getPostUri } from '@modules/activitypub-uris'
import { generateRsaSha256KeyPair, verifySignature } from '@modules/http-signatures'
import { createTestPost, createTestUserDirect, readAllQueueJobs } from '@voucha/test-helpers'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

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
  await updateUserFields(user.id, { is_fediverse_federation_enabled: true })
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

async function observeJob<T extends { name: string; data: unknown }>(
  predicate: (job: T) => boolean,
): Promise<{ job: Promise<T>; close: () => Promise<void> }> {
  const events = new QueueEvents('activitypub', {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    lastEventId: '$',
  })
  const found = Promise.withResolvers<T>()
  events.on('error', error => found.reject(error))
  events.on('added', (event: { jobId: string }) => {
    void activitypub.getJob(event.jobId).then(candidate => {
      if (candidate && predicate(candidate as unknown as T))
        found.resolve(candidate as unknown as T)
    }, found.reject)
  })
  await events.waitUntilReady()
  return { job: found.promise, close: () => events.close() }
}

async function findDeliveredJob(
  activityId: string,
): Promise<{ name: string; data: DeliverActivityData }> {
  const match = (await readAllQueueJobs(activitypub)).find(
    job =>
      job.name === 'deliverActivity' && (job.data as DeliverActivityData).activityId === activityId,
  )
  if (!match) throw new Error(`Expected a deliverActivity job for ${activityId}`)
  return match as { name: string; data: DeliverActivityData }
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
          url,
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
// -> the real glide-mq activitypub queue -> the real distributeActivity processor
// (real DB read of the acting user's remote followers) -> the real deliverActivity processor
// (real HTTP-signature construction) -> a signature verifiable against the sending user's real
// actor keypair. Only the actual network socket is stubbed; every other layer is production code.
describe('ActivityPub outbound round trip (Phase C6)', () => {
  // Phase C6 loop prevention, at the real inbound-receiver entry point rather than the
  // entity-relations origin-gate in isolation (already covered by
  // entity-relations/upsert-origin-gating.test.mts and delete-origin-gating.test.mts): a Follow
  // delivered through dispatchInboundActivity — the actual function the /ap/inbox route calls —
  // must not itself enqueue an outbound distribution, or a remote server's Follow would bounce
  // back out as if it were a local action, forever.
  it('a Follow received through the real inbound receiver does not itself enqueue outbound distribution', async () => {
    const targetUser = await createFederatedUser()

    await createRemoteFollowerOf(targetUser.id)

    const jobs = await readAllQueueJobs(activitypub)
    expect(
      jobs.some(
        job =>
          job.name === 'distributeActivity' &&
          (job.data as { sourceUserId?: string }).sourceUserId === targetUser.id,
      ),
    ).toBe(false)
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
    const observed = await observeJob<{ name: string; data: DistributeActivityData }>(
      job =>
        job.name === 'distributeActivity' &&
        job.data.activityType === 'Follow' &&
        job.data.sourceUserId === sourceUser.id,
    )
    let distributeJob: { name: string; data: DistributeActivityData }
    try {
      await upsertEntityRelation(sourceUser, followMetadata, sourceUser, [followee])
      distributeJob = await observed.job
    } finally {
      await observed.close()
    }
    const distributeResult = await distributeActivity(distributeJob.data)
    expect(distributeResult.enqueued).toBeGreaterThan(0)

    const deliverJob = await findDeliveredJob(distributeJob.data.activityId)
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
    const distributeJob = await enqueueDistributeActivity({
      activityId: post.id,
      activityType: 'Like',
      sourceUserId: sourceUser.id,
      targetPostId: post.id,
    })
    if (!distributeJob) throw new Error('Expected a Like distribution job')
    const distributeResult = await distributeActivity(
      (distributeJob as Job<DistributeActivityData>).data,
    )
    expect(distributeResult.enqueued).toBeGreaterThan(0)

    const deliverJob = await findDeliveredJob(post.id)
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
