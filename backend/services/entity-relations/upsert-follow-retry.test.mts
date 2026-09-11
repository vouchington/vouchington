import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { upsertEntityRelation } from './upsert.mts'
import { softDeleteEntityRelation } from './delete.mts'
import { entityRelationMetadatum, type EntityRelationMetadata } from './metadata.mts'
import {
  beginTransaction,
  createTestPost,
  createTestUser,
  waitForQueueJobs,
} from '@voucha/test-helpers'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import type { DistributeActivityData } from '@queues/activitypub-delivery/enqueues'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { TransactionQuery } from '@data-stores/psql'

// Codex review round 2, fix #1: a retried upsert of an already-active follow must not re-emit an
// outbound ActivityPub Follow with a new activity id. ON CONFLICT DO UPDATE returns a row for a
// no-op retry just like it does for a fresh insert or a resurrection, so upsert.mts gates the
// emit on relations[].newly_active (build-insert-query.mts's RETURNING flag) instead of on
// relations.length > 0.
describe('upsertEntityRelation follow-upsert retry idempotency', () => {
  let userFollowUserMetadata: EntityRelationMetadata

  beforeAll(() => {
    userFollowUserMetadata = entityRelationMetadatum.find(
      m => m.subject_type === 'user' && m.object_type === 'user' && m.predicate === 'follow',
    )!
  })

  beforeEach(async () => {
    await activitypubDelivery.obliterate({ force: true })
  })

  function followDistributeJobsFor(
    jobs: Awaited<ReturnType<typeof activitypubDelivery.getJobs>>,
    sourceUserId: string,
    targetUserId: string,
  ): unknown[] {
    return jobs.filter(
      job =>
        job.name === 'distributeActivity' &&
        (job.data as DistributeActivityData).activityType === 'Follow' &&
        (job.data as Extract<DistributeActivityData, { activityType: 'Follow' | 'UndoFollow' }>)
          .sourceUserId === sourceUserId &&
        (job.data as Extract<DistributeActivityData, { activityType: 'Follow' | 'UndoFollow' }>)
          .targetUserId === targetUserId,
    )
  }

  it('does not re-emit an outbound Follow when retrying an already-active follow', async () => {
    const follower: PrivateUser = await createTestUser()
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    const firstJobs = await waitForQueueJobs(
      activitypubDelivery,
      j => followDistributeJobsFor(j, follower.id, followee.id).length > 0,
    )
    expect(followDistributeJobsFor(firstJobs, follower.id, followee.id)).toHaveLength(1)
    const firstActivityId = (
      followDistributeJobsFor(firstJobs, follower.id, followee.id)[0] as {
        data: DistributeActivityData
      }
    ).data.activityId

    // Retry the identical upsert while the follow is still active.
    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    const jobsAfterRetry = await waitForQueueJobs(
      activitypubDelivery,
      jobs => followDistributeJobsFor(jobs, follower.id, followee.id).length > 1,
      200,
    )
    expect(followDistributeJobsFor(jobsAfterRetry, follower.id, followee.id)).toHaveLength(1)
    expect(
      (
        followDistributeJobsFor(jobsAfterRetry, follower.id, followee.id)[0] as {
          data: DistributeActivityData
        }
      ).data.activityId,
    ).toBe(firstActivityId)
  })

  it('re-emits an outbound Follow when re-following after an unfollow (resurrection)', async () => {
    const follower: PrivateUser = await createTestUser()
    const followee = await createTestUser()

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    const initialJobs = await waitForQueueJobs(
      activitypubDelivery,
      j => followDistributeJobsFor(j, follower.id, followee.id).length > 0,
    )
    const initialActivityId = (
      followDistributeJobsFor(initialJobs, follower.id, followee.id)[0] as {
        data: DistributeActivityData
      }
    ).data.activityId
    await softDeleteEntityRelation(follower, userFollowUserMetadata, follower, [followee])
    await activitypubDelivery.obliterate({ force: true })

    await upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee])

    const jobs = await waitForQueueJobs(
      activitypubDelivery,
      j => followDistributeJobsFor(j, follower.id, followee.id).length > 0,
    )
    expect(followDistributeJobsFor(jobs, follower.id, followee.id)).toHaveLength(1)
    expect(
      (
        followDistributeJobsFor(jobs, follower.id, followee.id)[0] as {
          data: DistributeActivityData
        }
      ).data.activityId,
    ).not.toBe(initialActivityId)
  })

  it('preserves PostgreSQL cardinality errors for duplicate relation keys in one batch', async () => {
    const follower: PrivateUser = await createTestUser()
    const followee = await createTestUser()

    await expect(
      upsertEntityRelation(follower, userFollowUserMetadata, follower, [followee, followee]),
    ).rejects.toMatchObject({ code: '21000' })
  })

  it('serializes reverse overlapping bidirectional writes while preserving caller object order', async () => {
    const creator = await createTestUser()
    const first = await createTestPost({ user: creator })
    const second = await createTestPost({ user: creator })
    const third = await createTestPost({ user: creator })
    const related = entityRelationMetadatum.find(
      relation =>
        relation.subject_type === 'post' &&
        relation.object_type === 'post' &&
        relation.predicate === 'related',
    )!

    const firstDispatching = Promise.withResolvers<void>()
    const secondDispatching = Promise.withResolvers<void>()
    const [forward, reverse] = await Promise.all([
      upsertBidirectionalWithBarrier(
        creator,
        related,
        first,
        [third, second],
        firstDispatching,
        secondDispatching,
      ),
      upsertBidirectionalWithBarrier(
        creator,
        related,
        second,
        [first],
        secondDispatching,
        firstDispatching,
      ),
    ])

    expect(forward.map(relation => relation.object_id)).toEqual([third.id, second.id])
    expect(reverse.map(relation => relation.object_id)).toEqual([first.id])
  })

  async function upsertBidirectionalWithBarrier(
    creator: PrivateUser,
    relation: EntityRelationMetadata,
    subject: { id: string },
    objects: Array<{ id: string }>,
    dispatching: PromiseWithResolvers<void>,
    peerDispatching: PromiseWithResolvers<void>,
  ) {
    await using transaction = await beginTransaction()
    const relations = await upsertEntityRelation(creator, relation, subject, objects, {
      query: createBarrieredQuery(transaction, dispatching, peerDispatching),
      vote: false,
    })
    await transaction.commit()
    return relations
  }

  function createBarrieredQuery(
    query: TransactionQuery,
    dispatching: PromiseWithResolvers<void>,
    peerDispatching: PromiseWithResolvers<void>,
  ): TransactionQuery {
    return Object.assign(
      async (input: string, values?: unknown[]) => {
        dispatching.resolve()
        await peerDispatching.promise
        return query(input, values)
      },
      { client: query.client },
    ) as TransactionQuery
  }
})
