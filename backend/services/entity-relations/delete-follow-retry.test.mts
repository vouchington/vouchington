import { afterEach, describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { upsertEntityRelation } from './upsert.mts'
import { softDeleteEntityRelation } from './delete.mts'
import { entityRelationMetadatum, type EntityRelationMetadata } from './metadata.mts'
import { createTestUser, insertTestLegacyLocalFollow, readAllQueueJobs } from '@voucha/test-helpers'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import type { DistributeActivityData } from '@queues/activitypub-delivery/enqueues'
import { blueskyFollowPropagation } from '@queues/bluesky-follow-propagation/queues'
import type { ReconcileFollowData } from '@queues/bluesky-follow-propagation/enqueues'
import type { PrivateUser } from '@voucha/types/entities/user'

// Codex review round 2, fix #2: an idempotent unfollow retry (or an unfollow/block on a relation
// that was never active) must not enqueue an outbound UndoFollow — the UPDATE affects zero rows
// in that case. delete.mts now gates the enqueue on RETURNING object_id from the UPDATE instead
// of the raw `objects` param.
describe('softDeleteEntityRelation follow-unfollow retry idempotency', () => {
  let userFollowUserMetadata: EntityRelationMetadata

  beforeAll(() => {
    userFollowUserMetadata = entityRelationMetadatum.find(
      m => m.subject_type === 'user' && m.object_type === 'user' && m.predicate === 'follow',
    )!
  })

  const pendingEnqueues: Promise<unknown>[] = []

  beforeEach(async () => {
    pendingEnqueues.length = 0
    vi.restoreAllMocks()
    trackBulkEnqueue(activitypubDelivery, pendingEnqueues)
    trackBulkEnqueue(blueskyFollowPropagation, pendingEnqueues)
    await activitypubDelivery.obliterate({ force: true })
    await blueskyFollowPropagation.obliterate({ force: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function undoFollowJobsFor(
    jobs: Awaited<ReturnType<typeof activitypubDelivery.getJobs>>,
    sourceUserId: string,
    targetUserId: string,
  ): unknown[] {
    return jobs.filter(
      job =>
        job.name === 'distributeActivity' &&
        (job.data as DistributeActivityData).activityType === 'UndoFollow' &&
        (job.data as Extract<DistributeActivityData, { activityType: 'Follow' | 'UndoFollow' }>)
          .sourceUserId === sourceUserId &&
        (job.data as Extract<DistributeActivityData, { activityType: 'Follow' | 'UndoFollow' }>)
          .targetUserId === targetUserId,
    )
  }

  function followActivitiesFor(
    jobs: Awaited<ReturnType<typeof activitypubDelivery.getJobs>>,
    sourceUserId: string,
    targetUserId: string,
  ): Array<Extract<DistributeActivityData, { activityType: 'Follow' }>> {
    return jobs
      .map(job => job.data as DistributeActivityData)
      .filter((data): data is Extract<DistributeActivityData, { activityType: 'Follow' }> => {
        return (
          data.activityType === 'Follow' &&
          data.sourceUserId === sourceUserId &&
          data.targetUserId === targetUserId
        )
      })
  }

  it('does not enqueue an outbound UndoFollow when unfollowing a relation that was never active', async () => {
    const follower: PrivateUser = await createTestUser()
    const followee = await createTestUser()

    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    await settleEnqueues(pendingEnqueues)
    const jobs = await readAllQueueJobs(activitypubDelivery)
    expect(undoFollowJobsFor(jobs, follower.id, followee.id)).toHaveLength(0)
  })

  it('does not re-enqueue an outbound UndoFollow when retrying an already-inactive unfollow', async () => {
    const follower: PrivateUser = await createTestUser()
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    await settleEnqueues(pendingEnqueues)
    await activitypubDelivery.obliterate({ force: true })

    // Retry the identical unfollow while the relation is already inactive.
    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    await settleEnqueues(pendingEnqueues)
    const jobs = await readAllQueueJobs(activitypubDelivery)
    expect(undoFollowJobsFor(jobs, follower.id, followee.id)).toHaveLength(0)
  })

  it('enqueues an outbound UndoFollow for a relation actually deleted by this call (control)', async () => {
    const follower: PrivateUser = await createTestUser()
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    await settleEnqueues(pendingEnqueues)
    let jobs = await readAllQueueJobs(activitypubDelivery)
    const originalActivityId = followActivitiesFor(jobs, follower.id, followee.id)[0]?.activityId
    expect(originalActivityId).toBeDefined()
    await activitypubDelivery.obliterate({ force: true })

    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    await settleEnqueues(pendingEnqueues)
    jobs = await readAllQueueJobs(activitypubDelivery)
    expect(undoFollowJobsFor(jobs, follower.id, followee.id)).toHaveLength(1)
    const undo = (
      undoFollowJobsFor(jobs, follower.id, followee.id)[0] as {
        data: Extract<DistributeActivityData, { activityType: 'UndoFollow' }>
      }
    ).data
    expect(undo.originalActivityId).toBe(originalActivityId)
    expect(undo.activityId).not.toBe(undo.originalActivityId)
  })

  it('reconciles Bluesky without emitting UndoFollow for a deleted legacy Follow', async () => {
    const follower: PrivateUser = await createTestUser()
    const followee = await createTestUser()
    await insertTestLegacyLocalFollow(follower.id, followee.id)

    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    await settleEnqueues(pendingEnqueues)
    const activityPubJobs = await readAllQueueJobs(activitypubDelivery)
    expect(undoFollowJobsFor(activityPubJobs, follower.id, followee.id)).toEqual([])

    const blueskyJobs = await readAllQueueJobs(blueskyFollowPropagation)
    expect(
      blueskyJobs
        .map(job => job.data as ReconcileFollowData)
        .filter(data => data.followerUserId === follower.id && data.followeeUserId === followee.id),
    ).toHaveLength(1)
  })
})

function trackBulkEnqueue(
  queue: { addBulk: (jobs: ReadonlyArray<{ name: string; data: unknown }>) => Promise<unknown> },
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
