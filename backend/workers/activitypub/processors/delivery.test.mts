import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Worker } from 'glide-mq'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { getActorKeyId, getActorUri } from '@modules/activitypub-uris'
import { getOrCreateActorKeyPair } from '@services/ap-actor-keys'
import { createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import { createFederatedUser } from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import {
  isCapturedActivityPubRequestSigned,
  stubActivityPubSocketForTest,
} from '@voucha/test-helpers/activitypub-outbound-fixtures'
import { observePostgresReadRoutingForTest } from '@voucha/test-helpers/postgres-read-routing'
import {
  getUndoFollowActivityId,
  type DeliverActivityData,
} from '@queues/activitypub/enqueues/delivery'
import { getMinUUIDv7ForDate, mintUUIDv7 } from '@modules/utils/ids'
import { getMaximumActivityAgeDays } from '@services/ap-inbox-activities/config'
import { deliverActivity } from './delivery.mts'

const INBOX_URL = 'https://a.example/inbox'

function expiredActivityId(): string {
  return getMinUUIDv7ForDate(new Date(Date.now() - (getMaximumActivityAgeDays() + 1) * 86_400_000))
}

// A federated sender with an actor keypair and a target that is federated or not.
async function followScene({ targetFederated = true, withKeypair = true } = {}) {
  const source = await createFederatedUser()
  const target = targetFederated ? await createFederatedUser() : await createTestUserDirect()
  const keyPair = withKeypair ? await getOrCreateActorKeyPair(source.id) : null
  const followData: DeliverActivityData = {
    activityId: mintUUIDv7(),
    activityType: 'Follow',
    sourceUserId: source.id,
    targetUserId: target.id,
    inboxUrl: INBOX_URL,
  }
  return { source, target, keyPair, followData }
}

const LEGACY_UNDO_FOLLOW_DATA = {
  activityId: 'legacy-undo-follow',
  activityType: 'UndoFollow',
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
  inboxUrl: INBOX_URL,
} as unknown as DeliverActivityData

const LEGACY_UNDO_LIKE_DATA = {
  activityId: 'legacy-undo-like',
  activityType: 'UndoLike',
  sourceUserId: 'user-1',
  targetPostId: 'post-1',
  inboxUrl: INBOX_URL,
} as unknown as DeliverActivityData

const BLANK_UNDO_LIKE_DATA: DeliverActivityData = {
  activityId: 'blank-undo-like',
  activityType: 'UndoLike',
  originalActivityId: '   ',
  sourceUserId: 'user-1',
  targetPostId: 'post-1',
  inboxUrl: INBOX_URL,
}

// Runs the delivery with no database read allowed and no request sent.
async function deliverWithoutReads(data: DeliverActivityData) {
  const captured = stubActivityPubSocketForTest()
  const routing = await observePostgresReadRoutingForTest()
  try {
    const result = await routing.run(() => deliverActivity(data))
    expect(routing.primaryAcquisitions()).toBe(0)
    expect(routing.replicaAcquisitions()).toBe(0)
    return result
  } finally {
    await routing.close()
    expect(captured).toEqual([])
  }
}

describe('deliverActivity', () => {
  it('keeps direct Accept replies outside the activity-age check', async () => {
    const captured = stubActivityPubSocketForTest()
    const source = await createFederatedUser()
    await getOrCreateActorKeyPair(source.id)
    const accept: DeliverActivityData = {
      activityType: 'Accept',
      activityId: randomUUID(),
      sourceUserId: source.id,
      inboxUrl: INBOX_URL,
      followActivityId: 'remote-follow',
      followActorUri: 'https://a.example/users/follower',
    }
    expect(await deliverActivity(accept)).toEqual({ delivered: true })
    expect(captured).toHaveLength(1)
    expect(captured[0]!.url).toBe(INBOX_URL)
  })

  it('delivers an UndoFollow whose own id is derived but whose original Follow is recent', async () => {
    const captured = stubActivityPubSocketForTest()
    const { source, target, followData } = await followScene()
    const undo: DeliverActivityData = {
      activityType: 'UndoFollow',
      activityId: getUndoFollowActivityId(followData.activityId),
      originalActivityId: followData.activityId,
      sourceUserId: source.id,
      targetUserId: target.id,
      inboxUrl: INBOX_URL,
    }
    expect(await deliverActivity(undo)).toEqual({ delivered: true })
    expect(JSON.parse(captured[0]!.body)).toMatchObject({
      type: 'Undo',
      actor: getActorUri(source.id),
    })
  })

  it.each([
    ['expired Follow', { activityId: expiredActivityId() }, 'expired-activity'],
    [
      'UndoFollow of an expired Follow',
      { activityType: 'UndoFollow', originalActivityId: expiredActivityId() },
      'expired-activity',
    ],
    ['Follow with a non-UUIDv7 id', { activityId: 'not-uuid-v7' }, 'unsupported-activity-id'],
  ] as const)('drops an %s before opt-in reads or HTTP', async (_name, overrides, reason) => {
    const data = {
      activityId: mintUUIDv7(),
      activityType: 'Follow',
      sourceUserId: 'user-1',
      targetUserId: 'user-2',
      inboxUrl: INBOX_URL,
      ...overrides,
    } as DeliverActivityData
    expect(await deliverWithoutReads(data)).toEqual({ delivered: false, reason })
  })

  it.each([
    ['UndoFollow', LEGACY_UNDO_FOLLOW_DATA],
    ['UndoLike', LEGACY_UNDO_LIKE_DATA],
    ['UndoLike with a blank original id', BLANK_UNDO_LIKE_DATA],
  ])('terminally drops a legacy %s job before build or HTTP', async (_name, data) => {
    expect(await deliverWithoutReads(data)).toEqual({
      delivered: false,
      reason: 'missing-original-activity-id',
    })
  })

  it('drops the job without throwing when the source had federation disabled after the job was enqueued', async () => {
    const captured = stubActivityPubSocketForTest()
    const { followData } = await followScene()
    const disabledSource = await createTestUserDirect()

    const result = await deliverActivity({ ...followData, sourceUserId: disabledSource.id })

    expect(result).toEqual({ delivered: false, reason: 'federation-disabled' })
    expect(captured).toEqual([])
  })

  it('drops a queued Like when the post becomes private before delivery', async () => {
    const captured = stubActivityPubSocketForTest()
    const source = await createFederatedUser()
    await getOrCreateActorKeyPair(source.id)
    const author = await createTestUserDirect()
    const postId = await insertTestPost({
      createdById: author.id,
      title: 'Private delivery target',
      slug: `private-delivery-${randomUUID()}`,
      markdown: 'Only the author can read this post.',
      broadcast: 'users',
      privacy: 'private',
    })
    await expect(
      deliverActivity({
        activityId: mintUUIDv7(),
        activityType: 'Like',
        sourceUserId: source.id,
        targetPostId: postId,
        inboxUrl: INBOX_URL,
      }),
    ).resolves.toEqual({
      delivered: false,
      reason: 'post-not-public',
    })
    expect(captured).toEqual([])
  })

  it('drops a Follow job without throwing when the target had federation disabled after the job was enqueued', async () => {
    const captured = stubActivityPubSocketForTest()
    const { followData } = await followScene({ targetFederated: false })

    expect(await deliverActivity(followData)).toEqual({
      delivered: false,
      reason: 'federation-disabled',
    })
    expect(captured).toEqual([])
  })

  it('drops the job without throwing when the sender has no actor keypair', async () => {
    const captured = stubActivityPubSocketForTest()
    const { followData } = await followScene({ withKeypair: false })

    expect(await deliverActivity(followData)).toEqual({
      delivered: false,
      reason: 'missing-actor-keypair',
    })
    expect(captured).toEqual([])
  })

  it('drops an UndoFollow job without throwing when the target had federation disabled after the job was enqueued', async () => {
    const captured = stubActivityPubSocketForTest()
    const { source, target, followData } = await followScene({ targetFederated: false })

    const result = await deliverActivity({
      activityType: 'UndoFollow',
      activityId: getUndoFollowActivityId(followData.activityId),
      originalActivityId: followData.activityId,
      sourceUserId: source.id,
      targetUserId: target.id,
      inboxUrl: INBOX_URL,
    })

    expect(result).toEqual({ delivered: false, reason: 'federation-disabled' })
    expect(captured).toEqual([])
  })

  it('builds the activity and signs+delivers it to the inbox', async () => {
    const captured = stubActivityPubSocketForTest()
    const { source, target, keyPair, followData } = await followScene()

    const result = await deliverActivity(followData)

    expect(result).toEqual({ delivered: true })
    expect(captured).toHaveLength(1)
    const request = captured[0]!
    expect(request.url).toBe(INBOX_URL)
    expect(JSON.parse(request.body)).toMatchObject({
      type: 'Follow',
      actor: getActorUri(source.id),
      object: getActorUri(target.id),
    })
    expect(request.headers.signature).toContain(`keyId="${getActorKeyId(source.id)}"`)
    expect(isCapturedActivityPubRequestSigned(request, keyPair!.public_key_pem)).toBe(true)
  })

  it('converts a permanent 4xx delivery failure to UnrecoverableError', async () => {
    stubActivityPubSocketForTest(() => new Response('gone', { status: 410 }))
    const { followData } = await followScene()

    await expect(deliverActivity(followData)).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it('rethrows a retryable 5xx delivery failure as-is', async () => {
    stubActivityPubSocketForTest(() => new Response('unavailable', { status: 503 }))
    const { followData } = await followScene()

    const thrown: unknown = await deliverActivity(followData).catch((err: unknown) => err)

    expect(thrown).not.toBeInstanceOf(UnrecoverableError)
    expect(thrown).toMatchObject({ status: 503 })
  })

  it('requeues a 429 for the remote Retry-After through the real delivery request', async () => {
    stubActivityPubSocketForTest(
      () => new Response('slow down', { status: 429, headers: { 'Retry-After': '120' } }),
    )
    const { followData } = await followScene()

    const thrown: unknown = await deliverActivity(followData).catch((err: unknown) => err)

    expect(thrown).toMatchObject({
      name: 'RateLimitError',
      delayMs: 120_000,
      cause: { status: 429, retryAfterMs: 120_000 },
    })
  })

  it('keeps a 429 that names no wait on the bounded attempt path', async () => {
    stubActivityPubSocketForTest(() => new Response('slow down', { status: 429 }))
    const { followData } = await followScene()

    const thrown: unknown = await deliverActivity(followData).catch((err: unknown) => err)

    expect(thrown).not.toBeInstanceOf(Worker.RateLimitError)
    expect(thrown).toMatchObject({ status: 429, retryAfterMs: null })
  })
})
