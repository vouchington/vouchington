import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPendingTasks, readAllQueueJobs, waitForQueueJobs } from '@voucha/test-helpers'
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
  beforeEach(clearQueues)
  afterEach(clearQueues)

  it('does not enqueue for another relation', async () => {
    enqueueUndoFollowSideEffects(muteRelation, [deletedPair])
    await flushPendingTasks()

    expect(await readAllQueueJobs(activitypubDelivery)).toEqual([])
    expect(await blueskyFollowPropagation.getJobs('waiting', 0, 100)).toEqual([])
  })

  it('does not enqueue for an empty Follow deletion result', async () => {
    enqueueUndoFollowSideEffects(followRelation, [])
    await flushPendingTasks()

    expect(await readAllQueueJobs(activitypubDelivery)).toEqual([])
    expect(await blueskyFollowPropagation.getJobs('waiting', 0, 100)).toEqual([])
  })

  it('enqueues matching ActivityPub UndoFollow and Bluesky reconciliation jobs', async () => {
    enqueueUndoFollowSideEffects(followRelation, [deletedPair])

    const activityPubJobs = await waitForQueueJobs(activitypubDelivery, jobs => jobs.length === 1)
    expect(activityPubJobs).toHaveLength(1)
    expect(activityPubJobs[0]?.name).toBe('distributeActivity')
    expect(activityPubJobs[0]?.data as DistributeActivityData).toEqual({
      activityId: 'undo-activity',
      activityType: 'UndoFollow',
      originalActivityId: 'follow-activity',
      sourceUserId: 'follower',
      targetUserId: 'followee',
    })

    const blueskyJobs = await waitForQueueJobs(blueskyFollowPropagation, jobs => jobs.length === 1)
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

    await flushPendingTasks()
    expect(await readAllQueueJobs(activitypubDelivery)).toEqual([])

    const blueskyJobs = await waitForQueueJobs(blueskyFollowPropagation, jobs => jobs.length === 1)
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
