import { beforeEach, describe, expect, it } from 'vitest'
import {
  createTestUser,
  getEntityRelation,
  insertTestLegacyLocalFollow,
  insertTestLocalFollow,
  readAllQueueJobs,
  waitForQueueJobs,
} from '@voucha/test-helpers'
import { upsertUserVouchElectionVotes } from '@services/elections-votes/user-vouch'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import type { DistributeActivityData } from '@queues/activitypub-delivery/enqueues'
import { blueskyFollowPropagation } from '@queues/bluesky-follow-propagation/queues'
import type { ReconcileFollowData } from '@queues/bluesky-follow-propagation/enqueues'

describe('user vouch follow side effects', () => {
  beforeEach(async () => {
    await activitypubDelivery.obliterate({ force: true })
    await blueskyFollowPropagation.obliterate({ force: true })
  })

  it('emits UndoFollow and Bluesky reconciliation for the follow deleted by a disavow', async () => {
    const voter = await createTestUser()
    const target = await createTestUser()
    await insertTestLocalFollow(voter.id, target.id)
    const relations = (await getEntityRelation(
      'relation__user__follow__user',
      voter.id,
      target.id,
    )) as Array<{ outbound_ap_follow_activity_id: string }>
    const originalActivityId = relations[0]?.outbound_ap_follow_activity_id
    expect(originalActivityId).toBeDefined()

    await upsertUserVouchElectionVotes(voter.id, [{ entityId: target.id, score: -2 }])

    const activityJobs = await waitForQueueJobs(activitypubDelivery, jobs =>
      jobs.some(job => {
        const data = job.data as DistributeActivityData
        return (
          data.activityType === 'UndoFollow' &&
          data.sourceUserId === voter.id &&
          data.targetUserId === target.id
        )
      }),
    )
    const undo = activityJobs
      .map(job => job.data as DistributeActivityData)
      .find(
        (data): data is Extract<DistributeActivityData, { activityType: 'UndoFollow' }> =>
          data.activityType === 'UndoFollow' &&
          data.sourceUserId === voter.id &&
          data.targetUserId === target.id,
      )
    expect(undo).toBeDefined()
    expect(undo?.originalActivityId).toBe(originalActivityId)
    expect(undo?.activityId).not.toBe(undo?.originalActivityId)

    const blueskyJobs = await waitForQueueJobs(blueskyFollowPropagation, jobs =>
      jobs.some(job => {
        const data = job.data as ReconcileFollowData
        return data.followerUserId === voter.id && data.followeeUserId === target.id
      }),
    )
    expect(
      blueskyJobs
        .map(job => job.data as ReconcileFollowData)
        .some(data => data.followerUserId === voter.id && data.followeeUserId === target.id),
    ).toBe(true)
  })

  it('reconciles Bluesky without emitting UndoFollow when disavowing a legacy Follow', async () => {
    const voter = await createTestUser()
    const target = await createTestUser()
    await insertTestLegacyLocalFollow(voter.id, target.id)

    await upsertUserVouchElectionVotes(voter.id, [{ entityId: target.id, score: -2 }])
    await activitypubDelivery.getJobCounts()

    const blueskyJobs = await waitForQueueJobs(blueskyFollowPropagation, jobs =>
      jobs.some(job => {
        const data = job.data as ReconcileFollowData
        return data.followerUserId === voter.id && data.followeeUserId === target.id
      }),
    )
    expect(
      blueskyJobs
        .map(job => job.data as ReconcileFollowData)
        .filter(data => data.followerUserId === voter.id && data.followeeUserId === target.id),
    ).toHaveLength(1)
    expect(
      (await readAllQueueJobs(activitypubDelivery))
        .map(job => job.data as DistributeActivityData)
        .filter(
          data =>
            data.activityType === 'UndoFollow' &&
            data.sourceUserId === voter.id &&
            data.targetUserId === target.id,
        ),
    ).toEqual([])
  })
})
