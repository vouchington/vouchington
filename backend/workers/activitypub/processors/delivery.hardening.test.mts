import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestUserDirect, insertTestPost, readAllQueueJobs } from '@voucha/test-helpers'
import { createFederatedUser } from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import {
  createRemoteFollowersForTest,
  stubActivityPubSocketForTest,
} from '@voucha/test-helpers/activitypub-outbound-fixtures'
import { background } from '@queues/background/queues'
import { observePostgresReadRoutingForTest } from '@voucha/test-helpers/postgres-read-routing'
import { updateUserFields } from '@services/users/update-fields'
import { getOrCreateActorKeyPair } from '@services/ap-actor-keys'
import { getUndoFollowActivityId } from '@queues/activitypub/enqueues/delivery'
import { getMinUUIDv7ForDate, mintUUIDv7 } from '@modules/utils/ids'
import { getMaximumActivityAgeDays } from '@services/ap-inbox-activities/config'
import type { DistributeActivityData } from '@queues/background/enqueues/activitypub-domain'
import { deliverActivity, distributeActivity } from './delivery.mts'
import {
  FOLLOW_DATA,
  UNDO_FOLLOW_DATA,
  LIKE_DATA,
  LEGACY_UNDO_FOLLOW_DATA,
  LEGACY_UNDO_LIKE_DATA,
} from '@voucha/test-helpers/activitypub-distribution-worker-fixtures'

const DELIVER_JOB_NAME = 'activitypub.deliverActivity'

async function deliveriesFor(activityId: string) {
  return (await readAllQueueJobs(background))
    .filter(
      job =>
        job.name === DELIVER_JOB_NAME &&
        (job.data as { activityId?: string }).activityId === activityId,
    )
    .map(job => job.data as { inboxUrl: string })
}

// Runs the distribution with no database read allowed and no delivery enqueued.
async function distributeWithoutReads(data: DistributeActivityData) {
  const routing = await observePostgresReadRoutingForTest()
  try {
    const result = await routing.run(() => distributeActivity(data))
    expect(routing.primaryAcquisitions()).toBe(0)
    expect(routing.replicaAcquisitions()).toBe(0)
    return result
  } finally {
    await routing.close()
    expect(await deliveriesFor(data.activityId)).toEqual([])
  }
}

async function followScene({ sourceFederated = true, targetFederated = true } = {}) {
  const source = sourceFederated ? await createFederatedUser() : await createTestUserDirect()
  const target = targetFederated ? await createFederatedUser() : await createTestUserDirect()
  const followers = await createRemoteFollowersForTest(source.id, 2)
  const followData: DistributeActivityData = {
    activityId: mintUUIDv7(),
    activityType: 'Follow',
    sourceUserId: source.id,
    targetUserId: target.id,
  }
  return { source, target, followers, followData }
}

const expiredActivityId = () =>
  getMinUUIDv7ForDate(new Date(Date.now() - (getMaximumActivityAgeDays() + 1) * 86_400_000))

describe('distributeActivity', () => {
  it.each([
    ['UndoFollow', LEGACY_UNDO_FOLLOW_DATA],
    ['UndoLike', LEGACY_UNDO_LIKE_DATA],
  ])('drops a %s with no original id', async (_name, data) => {
    expect(await distributeWithoutReads(data)).toEqual({
      enqueued: 0,
      completed: true,
      reason: 'missing-original-activity-id',
    })
  })

  it.each([
    ['an expired Follow', { ...FOLLOW_DATA, activityId: expiredActivityId() }, 'expired-activity'],
    [
      'an UndoFollow of an expired Follow',
      { ...UNDO_FOLLOW_DATA, originalActivityId: expiredActivityId() },
      'expired-activity',
    ],
    [
      'a Like with a non-UUIDv7 id',
      { ...LIKE_DATA, activityId: 'not-uuid-v7' },
      'unsupported-activity-id',
    ],
  ] as const)(
    'settles %s without opt-in reads, paging, or fan-out so recovery stops rescanning it',
    async (_name, data, reason) => {
      expect(await distributeWithoutReads(data)).toEqual({ enqueued: 0, completed: true, reason })
    },
  )

  it('does not fan out when the source disables federation', async () => {
    const { followData } = await followScene({ sourceFederated: false })
    await expect(distributeActivity(followData)).resolves.toEqual({
      enqueued: 0,
      completed: true,
    })
    expect(await deliveriesFor(followData.activityId)).toEqual([])
  })

  it('does not disclose a Follow or UndoFollow target that disables federation', async () => {
    const { source, target, followData } = await followScene({ targetFederated: false })
    await expect(distributeActivity(followData)).resolves.toEqual({
      enqueued: 0,
      completed: true,
    })
    const undo: DistributeActivityData = {
      activityId: getUndoFollowActivityId(followData.activityId),
      activityType: 'UndoFollow',
      originalActivityId: followData.activityId,
      sourceUserId: source.id,
      targetUserId: target.id,
    }
    await expect(distributeActivity(undo)).resolves.toEqual({
      enqueued: 0,
      completed: true,
    })
    expect(await deliveriesFor(followData.activityId)).toEqual([])
    expect(await deliveriesFor(undo.activityId)).toEqual([])
  })

  it('suppresses a Like when its post is no longer public before fan-out', async () => {
    const source = await createFederatedUser()
    await createRemoteFollowersForTest(source.id, 1)
    const author = await createTestUserDirect()
    const postId = await insertTestPost({
      createdById: author.id,
      title: 'Private distribution target',
      slug: `private-distribution-${randomUUID()}`,
      markdown: 'Only the author can read this post.',
      broadcast: 'users',
      privacy: 'private',
    })
    const activityId = mintUUIDv7()
    await expect(
      distributeActivity({
        activityId,
        activityType: 'Like',
        sourceUserId: source.id,
        targetPostId: postId,
      }),
    ).resolves.toEqual({
      enqueued: 0,
      completed: true,
    })
    expect(await deliveriesFor(activityId)).toEqual([])
  })

  it('admits the page and passes its cursor to the next dispatcher job', async () => {
    const { followers, followData } = await followScene()
    const [first, second] = followers.toSorted((a, b) => (a.id < b.id ? -1 : 1)) as [
      (typeof followers)[number],
      (typeof followers)[number],
    ]

    await expect(distributeActivity(followData, 1)).resolves.toEqual({
      enqueued: 1,
      completed: false,
      cursor: first.id,
    })
    expect(await deliveriesFor(followData.activityId)).toEqual([
      { ...followData, inboxUrl: first.inbox_url },
    ])

    await expect(distributeActivity({ ...followData, cursor: first.id }, 1)).resolves.toEqual({
      enqueued: 1,
      completed: true,
    })
    expect(
      (await deliveriesFor(followData.activityId)).toSorted((a, b) =>
        a.inboxUrl < b.inboxUrl ? -1 : 1,
      ),
    ).toEqual(
      [
        { ...followData, inboxUrl: first.inbox_url },
        { ...followData, cursor: first.id, inboxUrl: second.inbox_url },
      ].toSorted((a, b) => (a.inboxUrl < b.inboxUrl ? -1 : 1)),
    )
  })

  it('retries the same page when Valkey rejects delivery admission', async () => {
    const { followers, followData } = await followScene()
    const error = new Error('Valkey rejected the batch')
    const spy = vi.spyOn(background, 'addBulk').mockRejectedValueOnce(error)
    onTestFinished(() => spy.mockRestore())

    await expect(distributeActivity(followData)).rejects.toBe(error)
    expect(await deliveriesFor(followData.activityId)).toEqual([])

    await expect(distributeActivity(followData)).resolves.toEqual({ enqueued: 2, completed: true })
    expect(
      (await deliveriesFor(followData.activityId)).map(job => job.inboxUrl).toSorted(),
    ).toEqual(followers.map(follower => follower.inbox_url).toSorted())
  })
})

describe('ActivityPub terminal eligibility reads', () => {
  it('checks both Follow participants on primary before completing distribution', async () => {
    const source = await createTestUserDirect()
    const target = await createTestUserDirect()
    await Promise.all([
      updateUserFields(source.id, { is_fediverse_federation_enabled: true }),
      updateUserFields(target.id, { is_fediverse_federation_enabled: true }),
    ])
    const data = {
      activityId: mintUUIDv7(),
      activityType: 'Follow' as const,
      sourceUserId: source.id,
      targetUserId: target.id,
    }

    const routing = await observePostgresReadRoutingForTest()
    try {
      await expect(routing.run(() => distributeActivity(data))).resolves.toEqual({
        enqueued: 0,
        completed: true,
      })
      // Source opt-in, target opt-in, and the admitted follower page each acquire primary.
      expect(routing.primaryAcquisitions()).toBe(3)
      expect(routing.replicaAcquisitions()).toBe(0)

      await updateUserFields(target.id, { is_fediverse_federation_enabled: false })
      await expect(routing.run(() => distributeActivity(data))).resolves.toEqual({
        enqueued: 0,
        completed: true,
      })
      // The disabled target prevents the page read after the two authoritative opt-in reads.
      expect(routing.primaryAcquisitions()).toBe(5)
      expect(routing.replicaAcquisitions()).toBe(0)
    } finally {
      await routing.close()
    }
  })

  it('checks both opt-ins and the actor key on primary before delivering', async () => {
    const source = await createTestUserDirect()
    const target = await createTestUserDirect()
    await Promise.all([
      updateUserFields(source.id, { is_fediverse_federation_enabled: true }),
      updateUserFields(target.id, { is_fediverse_federation_enabled: true }),
    ])
    await getOrCreateActorKeyPair(source.id)
    const captured = stubActivityPubSocketForTest()
    const routing = await observePostgresReadRoutingForTest()
    try {
      await expect(
        routing.run(() =>
          deliverActivity({
            activityId: mintUUIDv7(),
            activityType: 'Follow',
            sourceUserId: source.id,
            targetUserId: target.id,
            inboxUrl: 'https://follower.example/inbox',
          }),
        ),
      ).resolves.toEqual({ delivered: true })
      expect(captured).toHaveLength(1)
      // Two opt-in reads and the actor-key read must all reach the writer before HTTP delivery.
      expect(routing.primaryAcquisitions()).toBe(3)
      expect(routing.replicaAcquisitions()).toBe(0)
    } finally {
      await routing.close()
    }
  })
})
