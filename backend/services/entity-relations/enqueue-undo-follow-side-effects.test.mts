import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import type { DistributeActivityData } from '@queues/activitypub-delivery/enqueues'
import { blueskyFollowPropagation } from '@queues/bluesky-follow-propagation/queues'
import type { ReconcileFollowData } from '@queues/bluesky-follow-propagation/enqueues'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import {
  enqueueUndoFollowSideEffects,
  type DeletedFollowPair,
} from './enqueue-undo-follow-side-effects.mts'

const followRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  predicate: 'follow',
  objectType: 'user',
})
const muteRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'user',
  predicate: 'mute',
  objectType: 'user',
})
const deletedPair: DeletedFollowPair = {
  subjectId: 'follower',
  objectId: 'followee',
  activityPubUndoIdentity: {
    originalActivityId: 'follow-activity',
    undoActivityId: 'undo-activity',
  },
}

describe('enqueueUndoFollowSideEffects', () => {
  const pendingEnqueues: Promise<unknown>[] = []

  beforeEach(async () => {
    pendingEnqueues.length = 0
    vi.restoreAllMocks()
    trackBulkEnqueue(activitypubDelivery, pendingEnqueues)
    trackBulkEnqueue(blueskyFollowPropagation, pendingEnqueues)
    await clearQueues()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await clearQueues()
  })

  it('does not enqueue for another relation', async () => {
    enqueueUndoFollowSideEffects(muteRelation, [deletedPair])
    await settleEnqueues(pendingEnqueues)

    expect(await readAllQueueJobs(activitypubDelivery)).toEqual([])
    expect(await readAllQueueJobs(blueskyFollowPropagation)).toEqual([])
  })

  it('does not enqueue for an empty Follow deletion result', async () => {
    enqueueUndoFollowSideEffects(followRelation, [])
    await settleEnqueues(pendingEnqueues)

    expect(await readAllQueueJobs(activitypubDelivery)).toEqual([])
    expect(await readAllQueueJobs(blueskyFollowPropagation)).toEqual([])
  })

  it('enqueues matching ActivityPub UndoFollow and Bluesky reconciliation jobs', async () => {
    enqueueUndoFollowSideEffects(followRelation, [deletedPair])
    await settleEnqueues(pendingEnqueues)

    const activityPubJobs = await readAllQueueJobs(activitypubDelivery)
    expect(activityPubJobs).toHaveLength(1)
    expect(activityPubJobs[0]?.name).toBe('distributeActivity')
    expect(activityPubJobs[0]?.data as DistributeActivityData).toEqual({
      activityId: 'undo-activity',
      activityType: 'UndoFollow',
      originalActivityId: 'follow-activity',
      sourceUserId: 'follower',
      targetUserId: 'followee',
    })

    const blueskyJobs = await readAllQueueJobs(blueskyFollowPropagation)
    expect(blueskyJobs).toHaveLength(1)
    expect(blueskyJobs[0]?.name).toBe('reconcileFollow')
    expect(blueskyJobs[0]?.data as ReconcileFollowData).toEqual({
      followerUserId: 'follower',
      followeeUserId: 'followee',
    })
  })

  it('reconciles Bluesky without fabricating an UndoFollow for a legacy unknown identity', async () => {
    enqueueUndoFollowSideEffects(followRelation, [
      {
        subjectId: 'legacy-follower',
        objectId: 'followee',
        activityPubUndoIdentity: null,
      },
    ])

    await settleEnqueues(pendingEnqueues)
    expect(await readAllQueueJobs(activitypubDelivery)).toEqual([])

    const blueskyJobs = await readAllQueueJobs(blueskyFollowPropagation)
    expect(blueskyJobs).toHaveLength(1)
    expect(blueskyJobs[0]?.data as ReconcileFollowData).toEqual({
      followerUserId: 'legacy-follower',
      followeeUserId: 'followee',
    })
  })
})

async function clearQueues(): Promise<void> {
  await activitypubDelivery.obliterate({ force: true })
  await blueskyFollowPropagation.obliterate({ force: true })
}

function trackBulkEnqueue(
  queue: { addBulk: (jobs: { name: string; data: unknown }[]) => Promise<unknown> },
  pending: Promise<unknown>[],
): void {
  const addBulk = queue.addBulk
  vi.spyOn(queue, 'addBulk').mockImplementation(jobs => {
    const enqueued = addBulk.call(queue, jobs)
    pending.push(enqueued)
    return enqueued
  })
}

async function settleEnqueues(pending: Promise<unknown>[]): Promise<void> {
  await Promise.all(pending)
}
