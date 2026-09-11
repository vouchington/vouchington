import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { upsertEntityRelation } from './upsert.mts'
import { entityRelationMetadatum, type EntityRelationMetadata } from './metadata.mts'
import { createTestUser, waitForQueueJobs } from '@voucha/test-helpers'
import { notifications } from '@queues/notifications/queues'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import type { DistributeActivityData } from '@queues/activitypub-delivery/enqueues'
import { blueskyFollowPropagation } from '@queues/bluesky-follow-propagation/queues'
import type { ReconcileFollowData } from '@queues/bluesky-follow-propagation/enqueues'
import type { PrivateUser } from '@voucha/types/entities/user'

// Phase C3 loop prevention: a write tagged origin: 'remote' (e.g. from C2's inbound ActivityPub
// receiver) must not re-trigger outbound-destined side effects, or a Follow delivered from a
// remote server could bounce back out as a notification-triggering local write forever.
describe('upsertEntityRelation origin gating (Phase C3 loop prevention)', () => {
  let follower: PrivateUser
  let userFollowUserMetadata: EntityRelationMetadata

  beforeAll(async () => {
    follower = await createTestUser()
    userFollowUserMetadata = entityRelationMetadatum.find(
      m => m.subject_type === 'user' && m.object_type === 'user' && m.predicate === 'follow',
    )!
  })

  beforeEach(async () => {
    await notifications.obliterate()
    await activitypubDelivery.obliterate({ force: true })
    await blueskyFollowPropagation.obliterate({ force: true })
  })

  // Poll until predicate is satisfied or timeout elapses, then return the final job list.
  async function waitForNotificationJobs(
    predicate: (jobs: Awaited<ReturnType<typeof notifications.getJobs>>) => boolean,
    timeoutMs = 1000,
  ): Promise<Awaited<ReturnType<typeof notifications.getJobs>>> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const jobs = await notifications.getJobs('waiting', 0, 100)
      if (predicate(jobs)) return jobs
      await new Promise<void>(resolve => setImmediate(resolve))
    }
    return notifications.getJobs('waiting', 0, 100)
  }

  function hasFollowJobFor(
    jobs: Awaited<ReturnType<typeof notifications.getJobs>>,
    followeeId: string,
  ): boolean {
    return jobs.some(
      job =>
        job.name === 'processFollowNotification' &&
        (job.data as { followeeId: string }).followeeId === followeeId,
    )
  }

  function hasFollowDistributeJobFor(
    jobs: Awaited<ReturnType<typeof activitypubDelivery.getJobs>>,
    targetUserId: string,
  ): boolean {
    return jobs.some(
      job =>
        job.name === 'distributeActivity' &&
        (job.data as DistributeActivityData).activityType === 'Follow' &&
        (job.data as Extract<DistributeActivityData, { activityType: 'Follow' | 'UndoFollow' }>)
          .targetUserId === targetUserId,
    )
  }

  it('does not enqueue a follow notification for a remote-origin follow write', async () => {
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee], {
      origin: 'remote',
    })

    // Poll briefly; a follow-notification job would appear within the timeout if the gate failed.
    const jobs = await waitForNotificationJobs(j => hasFollowJobFor(j, followee.id), 200)
    expect(hasFollowJobFor(jobs, followee.id)).toBe(false)
  })

  it('enqueues a follow notification for a local-origin follow write (control)', async () => {
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    const jobs = await waitForNotificationJobs(j => hasFollowJobFor(j, followee.id))
    expect(hasFollowJobFor(jobs, followee.id)).toBe(true)
  })

  // Phase C4: the outbound distributeActivity enqueue rides the same origin !== 'remote' guard as
  // the follow notification above — a remote-origin write (inbound federation) must never bounce
  // back out as an outbound Follow delivery, or two federating instances would loop forever.
  it('does not enqueue an outbound Follow distribution for a remote-origin follow write', async () => {
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee], {
      origin: 'remote',
    })

    const jobs = await waitForQueueJobs(
      activitypubDelivery,
      j => hasFollowDistributeJobFor(j, followee.id),
      200,
    )
    expect(hasFollowDistributeJobFor(jobs, followee.id)).toBe(false)
  })

  it('enqueues an outbound Follow distribution for a local-origin follow write (control)', async () => {
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    const jobs = await waitForQueueJobs(activitypubDelivery, j =>
      hasFollowDistributeJobFor(j, followee.id),
    )
    expect(hasFollowDistributeJobFor(jobs, followee.id)).toBe(true)
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
  // the notification and distributeActivity hooks above.
  it('does not enqueue a bluesky follow reconcile for a remote-origin follow write', async () => {
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee], {
      origin: 'remote',
    })

    const jobs = await waitForBlueskyReconcileJobs(
      j => hasBlueskyReconcileJobFor(j, followee.id),
      200,
    )
    expect(hasBlueskyReconcileJobFor(jobs, followee.id)).toBe(false)
  })

  it('enqueues a bluesky follow reconcile for a local-origin follow write (control)', async () => {
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    const jobs = await waitForBlueskyReconcileJobs(j => hasBlueskyReconcileJobFor(j, followee.id))
    expect(hasBlueskyReconcileJobFor(jobs, followee.id)).toBe(true)
  })
})
