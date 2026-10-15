import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readAllQueueJobs, removeEnqueuedJobs } from '@voucha/test-helpers'
import { activitypub } from '@queues/activitypub/queues'
import type { DistributeActivityData } from '@queues/activitypub/enqueues/delivery'
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
  subjectId: randomUUID(),
  objectId: randomUUID(),
  activityPubUndoIdentity: {
    originalActivityId: randomUUID(),
    undoActivityId: randomUUID(),
  },
}

describe('enqueueUndoFollowSideEffects', () => {
  const pendingEnqueues: Promise<unknown>[] = []

  beforeEach(async () => {
    pendingEnqueues.length = 0
    vi.restoreAllMocks()
    trackBulkEnqueue(activitypub, pendingEnqueues)
    trackBulkEnqueue(blueskyFollowPropagation, pendingEnqueues)
    await clearQueues()
  })

  afterEach(async () => {
    await removeEnqueuedJobs(pendingEnqueues, 'activitypub.distributeActivity')
    vi.restoreAllMocks()
    await clearQueues()
  })

  it('does not enqueue for another relation', async () => {
    enqueueUndoFollowSideEffects(muteRelation, [deletedPair])
    await settleEnqueues(pendingEnqueues)

    expect(await ownedActivityJobs()).toEqual([])
    expect(await readAllQueueJobs(blueskyFollowPropagation)).toEqual([])
  })

  it('does not enqueue for an empty Follow deletion result', async () => {
    enqueueUndoFollowSideEffects(followRelation, [])
    await settleEnqueues(pendingEnqueues)

    expect(await ownedActivityJobs()).toEqual([])
    expect(await readAllQueueJobs(blueskyFollowPropagation)).toEqual([])
  })

  it('enqueues matching ActivityPub UndoFollow and Bluesky reconciliation jobs', async () => {
    enqueueUndoFollowSideEffects(followRelation, [deletedPair])
    await settleEnqueues(pendingEnqueues)

    const activityPubJobs = await ownedActivityJobs()
    expect(activityPubJobs).toHaveLength(1)
    expect(activityPubJobs[0]?.name).toBe('activitypub.distributeActivity')
    expect(activityPubJobs[0]?.data as DistributeActivityData).toEqual({
      activityId: deletedPair.activityPubUndoIdentity?.undoActivityId,
      activityType: 'UndoFollow',
      originalActivityId: deletedPair.activityPubUndoIdentity?.originalActivityId,
      sourceUserId: deletedPair.subjectId,
      targetUserId: deletedPair.objectId,
    })

    const blueskyJobs = await readAllQueueJobs(blueskyFollowPropagation)
    expect(blueskyJobs).toHaveLength(1)
    expect(blueskyJobs[0]?.name).toBe('reconcileFollow')
    expect(blueskyJobs[0]?.data as ReconcileFollowData).toEqual({
      followerUserId: deletedPair.subjectId,
      followeeUserId: deletedPair.objectId,
    })
  })

  it('reconciles Bluesky without fabricating an UndoFollow for a legacy unknown identity', async () => {
    const legacyFollowerId = randomUUID()
    enqueueUndoFollowSideEffects(followRelation, [
      {
        subjectId: legacyFollowerId,
        objectId: deletedPair.objectId,
        activityPubUndoIdentity: null,
      },
    ])

    await settleEnqueues(pendingEnqueues)
    expect(await ownedActivityJobs(legacyFollowerId)).toEqual([])

    const blueskyJobs = await readAllQueueJobs(blueskyFollowPropagation)
    expect(blueskyJobs).toHaveLength(1)
    expect(blueskyJobs[0]?.data as ReconcileFollowData).toEqual({
      followerUserId: legacyFollowerId,
      followeeUserId: deletedPair.objectId,
    })
  })
})

async function clearQueues(): Promise<void> {
  await blueskyFollowPropagation.obliterate({ force: true })
}

async function ownedActivityJobs(sourceUserId = deletedPair.subjectId) {
  return (await readAllQueueJobs(activitypub)).filter(
    job => (job.data as DistributeActivityData).sourceUserId === sourceUserId,
  )
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
