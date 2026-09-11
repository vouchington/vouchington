import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { upsertEntityRelationsForSubjects } from './upsert-for-subjects.mts'
import { softDeleteEntityRelationsForSubjects } from './delete.mts'
import { entityRelationMetadatum, type EntityRelationMetadata } from './metadata.mts'
import { createTestUser, insertTestLegacyLocalFollow, waitForQueueJobs } from '@voucha/test-helpers'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import type { DistributeActivityData } from '@queues/activitypub-delivery/enqueues'
import { blueskyFollowPropagation } from '@queues/bluesky-follow-propagation/queues'
import type { ReconcileFollowData } from '@queues/bluesky-follow-propagation/enqueues'
import type { PrivateUser } from '@voucha/types/entities/user'

// Self-review finding #10 (issue #7911 item 8): softDeleteEntityRelationsForSubjects — the bulk
// counterpart to softDeleteEntityRelation exercised by delete-follow-retry.test.mts and
// delete-origin-gating.test.mts — previously skipped the outbound UndoFollow dispatch and Bluesky
// follow-propagation reconcile entirely. These tests prove the bulk path now emits the same side
// effects as the singular path for every relation it actually deletes.
describe('softDeleteEntityRelationsForSubjects follow federation + Bluesky propagation', () => {
  let userFollowUserMetadata: EntityRelationMetadata

  beforeAll(() => {
    userFollowUserMetadata = entityRelationMetadatum.find(
      m => m.subject_type === 'user' && m.object_type === 'user' && m.predicate === 'follow',
    )!
  })

  beforeEach(async () => {
    await activitypubDelivery.obliterate({ force: true })
    await blueskyFollowPropagation.obliterate({ force: true })
  })

  function undoFollowPairs(jobs: { name: string; data: unknown }[]): Set<string> {
    return new Set(
      jobs
        .filter(job => job.name === 'distributeActivity')
        .map(
          job =>
            job.data as Extract<DistributeActivityData, { activityType: 'Follow' | 'UndoFollow' }>,
        )
        .filter(data => data.activityType === 'UndoFollow')
        .map(data => `${data.sourceUserId}__${data.targetUserId}`),
    )
  }

  function reconcilePairs(jobs: { name: string; data: unknown }[]): Set<string> {
    return new Set(
      jobs
        .filter(job => job.name === 'reconcileFollow')
        .map(job => job.data as ReconcileFollowData)
        .map(data => `${data.followerUserId}__${data.followeeUserId}`),
    )
  }

  it('dispatches UndoFollow + Bluesky reconcile for every subject actually unfollowed by the bulk call', async () => {
    const followee = await createTestUser()
    const followerA: PrivateUser = await createTestUser()
    const followerB: PrivateUser = await createTestUser()
    const neverFollowed: PrivateUser = await createTestUser()

    await upsertEntityRelationsForSubjects(
      followee,
      userFollowUserMetadata,
      [followerA, followerB],
      followee,
    )
    await activitypubDelivery.obliterate({ force: true })
    await blueskyFollowPropagation.obliterate({ force: true })

    // Includes a subject that was never following `followee` — the RETURNING-gated filter must
    // skip it, not emit a spurious UndoFollow/reconcile for a relation that never existed.
    await softDeleteEntityRelationsForSubjects(
      followee,
      userFollowUserMetadata,
      [followerA, followerB, neverFollowed],
      followee,
    )
    const apJobs = await waitForQueueJobs(
      activitypubDelivery,
      jobs => undoFollowPairs(jobs).size >= 2,
    )
    expect(undoFollowPairs(apJobs)).toEqual(
      new Set([`${followerA.id}__${followee.id}`, `${followerB.id}__${followee.id}`]),
    )

    const blueskyJobs = await waitForQueueJobs(
      blueskyFollowPropagation,
      jobs => reconcilePairs(jobs).size >= 2,
    )
    expect(reconcilePairs(blueskyJobs)).toEqual(
      new Set([`${followerA.id}__${followee.id}`, `${followerB.id}__${followee.id}`]),
    )
  })

  it('does not re-dispatch UndoFollow/reconcile when retrying an already-inactive bulk unfollow', async () => {
    const followee = await createTestUser()
    const follower: PrivateUser = await createTestUser()

    await upsertEntityRelationsForSubjects(followee, userFollowUserMetadata, [follower], followee)
    await softDeleteEntityRelationsForSubjects(
      followee,
      userFollowUserMetadata,
      [follower],
      followee,
    )
    await activitypubDelivery.obliterate({ force: true })
    await blueskyFollowPropagation.obliterate({ force: true })

    // Retry the identical bulk unfollow while the relation is already inactive.
    await softDeleteEntityRelationsForSubjects(
      followee,
      userFollowUserMetadata,
      [follower],
      followee,
    )

    const apJobs = await waitForQueueJobs(
      activitypubDelivery,
      jobs => undoFollowPairs(jobs).has(`${follower.id}__${followee.id}`),
      200,
    )
    expect(undoFollowPairs(apJobs).has(`${follower.id}__${followee.id}`)).toBe(false)

    const blueskyJobs = await waitForQueueJobs(
      blueskyFollowPropagation,
      jobs => reconcilePairs(jobs).has(`${follower.id}__${followee.id}`),
      200,
    )
    expect(reconcilePairs(blueskyJobs).has(`${follower.id}__${followee.id}`)).toBe(false)
  })

  it('does not dispatch UndoFollow/reconcile for a remote-origin bulk unfollow delete', async () => {
    const followee = await createTestUser()
    const follower: PrivateUser = await createTestUser()

    await upsertEntityRelationsForSubjects(followee, userFollowUserMetadata, [follower], followee)
    await activitypubDelivery.obliterate({ force: true })
    await blueskyFollowPropagation.obliterate({ force: true })

    await softDeleteEntityRelationsForSubjects(
      followee,
      userFollowUserMetadata,
      [follower],
      followee,
      {
        origin: 'remote',
      },
    )

    const apJobs = await waitForQueueJobs(
      activitypubDelivery,
      jobs => undoFollowPairs(jobs).has(`${follower.id}__${followee.id}`),
      200,
    )
    expect(undoFollowPairs(apJobs).has(`${follower.id}__${followee.id}`)).toBe(false)

    const blueskyJobs = await waitForQueueJobs(
      blueskyFollowPropagation,
      jobs => reconcilePairs(jobs).has(`${follower.id}__${followee.id}`),
      200,
    )
    expect(reconcilePairs(blueskyJobs).has(`${follower.id}__${followee.id}`)).toBe(false)
  })

  it('reconciles Bluesky without emitting UndoFollow for a legacy Follow in a bulk delete', async () => {
    const followee = await createTestUser()
    const legacyFollower: PrivateUser = await createTestUser()
    const knownFollower: PrivateUser = await createTestUser()
    await insertTestLegacyLocalFollow(legacyFollower.id, followee.id)
    await upsertEntityRelationsForSubjects(
      followee,
      userFollowUserMetadata,
      [knownFollower],
      followee,
    )
    await activitypubDelivery.obliterate({ force: true })
    await blueskyFollowPropagation.obliterate({ force: true })

    await softDeleteEntityRelationsForSubjects(
      followee,
      userFollowUserMetadata,
      [legacyFollower, knownFollower],
      followee,
    )

    const apJobs = await waitForQueueJobs(activitypubDelivery, jobs =>
      undoFollowPairs(jobs).has(`${knownFollower.id}__${followee.id}`),
    )
    expect(undoFollowPairs(apJobs)).toEqual(new Set([`${knownFollower.id}__${followee.id}`]))

    const blueskyJobs = await waitForQueueJobs(
      blueskyFollowPropagation,
      jobs => reconcilePairs(jobs).size === 2,
    )
    expect(reconcilePairs(blueskyJobs)).toEqual(
      new Set([`${legacyFollower.id}__${followee.id}`, `${knownFollower.id}__${followee.id}`]),
    )
  })
})
