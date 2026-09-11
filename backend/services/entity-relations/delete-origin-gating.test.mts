import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { upsertEntityRelation } from './upsert.mts'
import { softDeleteEntityRelation } from './delete.mts'
import { entityRelationMetadatum, type EntityRelationMetadata } from './metadata.mts'
import { createTestUser, waitForQueueJobs } from '@voucha/test-helpers'
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

  beforeEach(async () => {
    await activitypubDelivery.obliterate({ force: true })
    await blueskyFollowPropagation.obliterate({ force: true })
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
    await activitypubDelivery.obliterate({ force: true })

    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee], {
      origin: 'remote',
    })

    const jobs = await waitForQueueJobs(
      activitypubDelivery,
      j => hasUndoFollowDistributeJobFor(j, followee.id),
      200,
    )
    expect(hasUndoFollowDistributeJobFor(jobs, followee.id)).toBe(false)
  })

  it('enqueues an outbound UndoFollow distribution for a local-origin unfollow delete (control)', async () => {
    const followee = await createTestUser()
    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    await activitypubDelivery.obliterate({ force: true })

    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    const jobs = await waitForQueueJobs(activitypubDelivery, j =>
      hasUndoFollowDistributeJobFor(j, followee.id),
    )
    expect(hasUndoFollowDistributeJobFor(jobs, followee.id)).toBe(true)
  })

  // Poll until predicate is satisfied or timeout elapses, then return the final job list.
  async function waitForBlueskyReconcileJobs(
    predicate: (jobs: Awaited<ReturnType<typeof blueskyFollowPropagation.getJobs>>) => boolean,
    timeoutMs = 1000,
  ): Promise<Awaited<ReturnType<typeof blueskyFollowPropagation.getJobs>>> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const jobs = await blueskyFollowPropagation.getJobs('waiting', 0, 100)
      if (predicate(jobs)) return jobs
      await new Promise<void>(resolve => setImmediate(resolve))
    }
    return blueskyFollowPropagation.getJobs('waiting', 0, 100)
  }

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
    await blueskyFollowPropagation.obliterate({ force: true })

    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee], {
      origin: 'remote',
    })

    const jobs = await waitForBlueskyReconcileJobs(
      j => hasBlueskyReconcileJobFor(j, followee.id),
      200,
    )
    expect(hasBlueskyReconcileJobFor(jobs, followee.id)).toBe(false)
  })

  it('enqueues a bluesky follow reconcile for a local-origin unfollow delete (control)', async () => {
    const followee = await createTestUser()
    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    await blueskyFollowPropagation.obliterate({ force: true })

    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    const jobs = await waitForBlueskyReconcileJobs(j => hasBlueskyReconcileJobFor(j, followee.id))
    expect(hasBlueskyReconcileJobFor(jobs, followee.id)).toBe(true)
  })
})
