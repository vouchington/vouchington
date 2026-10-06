import { afterEach, describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { upsertEntityRelation } from './upsert.mts'
import { entityRelationMetadatum, type EntityRelationMetadata } from './metadata.mts'
import { createTestUser, readAllQueueJobs } from '@voucha/test-helpers'
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

  const pendingEnqueues: Promise<unknown>[] = []

  beforeEach(async () => {
    pendingEnqueues.length = 0
    vi.restoreAllMocks()
    trackBulkEnqueue(notifications, pendingEnqueues)
    trackBulkEnqueue(activitypubDelivery, pendingEnqueues)
    trackBulkEnqueue(blueskyFollowPropagation, pendingEnqueues)
    await notifications.obliterate()
    await activitypubDelivery.obliterate({ force: true })
    await blueskyFollowPropagation.obliterate({ force: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

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

    await settleEnqueues(pendingEnqueues)
    const jobs = await readAllQueueJobs(notifications)
    expect(hasFollowJobFor(jobs, followee.id)).toBe(false)
  })

  it('enqueues a follow notification for a local-origin follow write (control)', async () => {
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    await settleEnqueues(pendingEnqueues)
    const jobs = await readAllQueueJobs(notifications)
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

    await settleEnqueues(pendingEnqueues)
    const jobs = await readAllQueueJobs(activitypubDelivery)
    expect(hasFollowDistributeJobFor(jobs, followee.id)).toBe(false)
  })

  it('enqueues an outbound Follow distribution for a local-origin follow write (control)', async () => {
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    await settleEnqueues(pendingEnqueues)
    const jobs = await readAllQueueJobs(activitypubDelivery)
    expect(hasFollowDistributeJobFor(jobs, followee.id)).toBe(true)
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
  // the notification and distributeActivity hooks above.
  it('does not enqueue a bluesky follow reconcile for a remote-origin follow write', async () => {
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee], {
      origin: 'remote',
    })

    await settleEnqueues(pendingEnqueues)
    const jobs = await readAllQueueJobs(blueskyFollowPropagation)
    expect(hasBlueskyReconcileJobFor(jobs, followee.id)).toBe(false)
  })

  it('enqueues a bluesky follow reconcile for a local-origin follow write (control)', async () => {
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    await settleEnqueues(pendingEnqueues)
    const jobs = await readAllQueueJobs(blueskyFollowPropagation)
    expect(hasBlueskyReconcileJobFor(jobs, followee.id)).toBe(true)
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
