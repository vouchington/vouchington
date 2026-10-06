import { afterEach, describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { upsertEntityRelation } from './upsert.mts'
import { softDeleteEntityRelation } from './delete.mts'
import { entityRelationMetadatum, type EntityRelationMetadata } from './metadata.mts'
import { createTestUser, readAllQueueJobs } from '@voucha/test-helpers'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import type { DistributeActivityData } from '@queues/activitypub-delivery/enqueues'
import { blueskyFollowPropagation } from '@queues/bluesky-follow-propagation/queues'
import type { ReconcileFollowData } from '@queues/bluesky-follow-propagation/enqueues'
import type { PrivateUser } from '@voucha/types/entities/user'

// Phase C3 loop prevention: a delete tagged origin: 'remote' (e.g. an inbound ActivityPub
// Undo(Follow)) must not re-trigger outbound-destined side effects, or an Undo(Follow) delivered
// from a remote server could bounce back out as an outbound Undo(Follow) forever. Mirrors
// upsert-origin-gating.test.mts's pattern for the delete-side (unfollow) emit hook.
describe('softDeleteEntityRelation origin gating (Phase C3 loop prevention)', () => {
  let follower: PrivateUser
  let userFollowUserMetadata: EntityRelationMetadata

  beforeAll(async () => {
    follower = await createTestUser()
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

  function hasUndoFollowDistributeJobFor(
    jobs: Awaited<ReturnType<typeof activitypubDelivery.getJobs>>,
    targetUserId: string,
  ): boolean {
    return jobs.some(
      job =>
        job.name === 'distributeActivity' &&
        (job.data as DistributeActivityData).activityType === 'UndoFollow' &&
        (job.data as Extract<DistributeActivityData, { activityType: 'Follow' | 'UndoFollow' }>)
          .targetUserId === targetUserId,
    )
  }

  it('does not enqueue an outbound UndoFollow distribution for a remote-origin unfollow delete', async () => {
    const followee = await createTestUser()
    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    await settleEnqueues(pendingEnqueues)
    await activitypubDelivery.obliterate({ force: true })

    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee], {
      origin: 'remote',
    })

    await settleEnqueues(pendingEnqueues)
    const jobs = await readAllQueueJobs(activitypubDelivery)
    expect(hasUndoFollowDistributeJobFor(jobs, followee.id)).toBe(false)
  })

  it('enqueues an outbound UndoFollow distribution for a local-origin unfollow delete (control)', async () => {
    const followee = await createTestUser()
    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    await settleEnqueues(pendingEnqueues)
    await activitypubDelivery.obliterate({ force: true })

    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    await settleEnqueues(pendingEnqueues)
    const jobs = await readAllQueueJobs(activitypubDelivery)
    expect(hasUndoFollowDistributeJobFor(jobs, followee.id)).toBe(true)
  })

  function hasBlueskyReconcileJobFor(
    jobs: Awaited<ReturnType<typeof blueskyFollowPropagation.getJobs>>,
    followeeUserId: string,
  ): boolean {
    return jobs.some(
      job =>
        job.name === 'reconcileFollow' &&
        (job.data as ReconcileFollowData).followeeUserId === followeeUserId,
    )
  }

  // Phase D3: the bluesky-follow-propagation enqueue rides the same origin !== 'remote' guard as
  // the distributeActivity hook above.
  it('does not enqueue a bluesky follow reconcile for a remote-origin unfollow delete', async () => {
    const followee = await createTestUser()
    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    await settleEnqueues(pendingEnqueues)
    await blueskyFollowPropagation.obliterate({ force: true })

    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee], {
      origin: 'remote',
    })

    await settleEnqueues(pendingEnqueues)
    const jobs = await readAllQueueJobs(blueskyFollowPropagation)
    expect(hasBlueskyReconcileJobFor(jobs, followee.id)).toBe(false)
  })

  it('enqueues a bluesky follow reconcile for a local-origin unfollow delete (control)', async () => {
    const followee = await createTestUser()
    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    await settleEnqueues(pendingEnqueues)
    await blueskyFollowPropagation.obliterate({ force: true })

    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    await settleEnqueues(pendingEnqueues)
    const jobs = await readAllQueueJobs(blueskyFollowPropagation)
    expect(hasBlueskyReconcileJobFor(jobs, followee.id)).toBe(true)
  })
})

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
