import { describe, expect, it, vi } from 'vitest'
import { ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB } from '@queues/background/enqueues/activitypub-jobs'
import { BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB } from '@queues/background/enqueues/bluesky-follow-propagation-jobs'
import { VOTE_AGGREGATION_UPDATE_ELECTION_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import {
  createTestUser,
  getEntityRelation,
  getFollowExists,
  insertTestLocalFollow,
} from '@voucha/test-helpers'
import { holdQueueBulkAdmissions } from '@voucha/test-helpers/queue-admission-hold'
import { removeEnqueuedJobs } from '@voucha/test-helpers/queue-jobs'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { getUserVouchElectionVote } from './votes-get.mts'
import { upsertUserVouchElectionVotes } from './votes-upsert.mts'

describe('user-vouch vote admission', () => {
  it('waits for stats and both UndoFollow admissions after committing the disavow', async () => {
    const voter = await createTestUser()
    const target = await createTestUser()
    await insertTestLocalFollow(voter.id, target.id)
    const follows = (await getEntityRelation(
      'relation__user__follow__user',
      voter.id,
      target.id,
    )) as Array<{ outbound_activitypub_follow_activity_id: string }>
    const originalActivityId = follows[0]?.outbound_activitypub_follow_activity_id
    expect(originalActivityId).toBeDefined()

    const jobNames = [
      ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.name,
      BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB.name,
      VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name,
    ] as const
    const { holds, restore } = holdQueueBulkAdmissions(voteAggregation, [
      {
        jobName: jobNames[0],
        matchesData: data =>
          typeof data === 'object' &&
          data !== null &&
          'activityType' in data &&
          data.activityType === 'UndoFollow' &&
          'sourceUserId' in data &&
          data.sourceUserId === voter.id &&
          'targetUserId' in data &&
          data.targetUserId === target.id,
      },
      {
        jobName: jobNames[1],
        matchesData: data =>
          typeof data === 'object' &&
          data !== null &&
          'followerUserId' in data &&
          data.followerUserId === voter.id &&
          'followeeUserId' in data &&
          data.followeeUserId === target.id,
      },
      {
        jobName: jobNames[2],
        matchesData: data =>
          typeof data === 'object' &&
          data !== null &&
          'electionId' in data &&
          data.electionId === target.id &&
          'orderingKey' in data &&
          data.orderingKey === 'user_vouch',
      },
    ])
    const entered = holds.map(() => false)
    holds.forEach((hold, index) => {
      void hold.entered.then(() => {
        entered[index] = true
      })
    })
    let settled = false
    let operation: ReturnType<typeof upsertUserVouchElectionVotes> | undefined
    try {
      operation = upsertUserVouchElectionVotes(voter.id, [
        { entityId: target.id, score: -2 },
      ]).finally(() => {
        settled = true
      })
      await Promise.all(holds.map(hold => hold.entered))
      expect(await getUserVouchElectionVote(voter.id, target.id)).toMatchObject({
        entity_id: target.id,
        choice: 'disavow',
      })
      expect(await getFollowExists(voter.id, target.id)).toBe(false)
      expect(
        await getEntityRelation('relation__user__mute__user', voter.id, target.id),
      ).toHaveLength(1)
      expect(settled).toBe(false)

      holds.forEach(hold => hold.release())
      const [votes, [undoJobs, blueskyJobs, statsJobs]] = await Promise.all([
        operation,
        Promise.all(holds.map(hold => hold.admitted)),
      ])
      expect(votes).toEqual([expect.objectContaining({ entity_id: target.id, score: -2 })])
      expect(undoJobs).toHaveLength(1)
      const undo = undoJobs[0]?.data as {
        activityId: string
        originalActivityId: string
        sourceUserId: string
        targetUserId: string
      }
      expect(undo).toMatchObject({
        originalActivityId,
        sourceUserId: voter.id,
        targetUserId: target.id,
      })
      expect(undo.activityId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
      expect(undo.activityId).not.toBe(originalActivityId)
      expect(blueskyJobs).toEqual([
        expect.objectContaining({
          name: jobNames[1],
          data: { followerUserId: voter.id, followeeUserId: target.id },
        }),
      ])
      expect(statsJobs).toEqual([
        expect.objectContaining({
          name: jobNames[2],
          data: { electionId: target.id, orderingKey: 'user_vouch' },
        }),
      ])
    } finally {
      holds.forEach(hold => hold.release())
      try {
        await operation?.catch(() => undefined)
        await Promise.all(
          holds.map((hold, index) =>
            entered[index]
              ? removeEnqueuedJobs([hold.admitted.catch(() => [])], jobNames[index]!)
              : Promise.resolve(),
          ),
        )
      } finally {
        restore()
      }
    }
  })

  it('returns a committed ballot and reports a failed stats admission once', async () => {
    const voter = await createTestUser()
    const target = await createTestUser()
    const admissionError = new Error('Injected user-vouch stats admission failure')
    const originalAddBulk = voteAggregation.addBulk
    const reportsBefore = sentryCaptureExceptionMock.mock.calls.length
    let matchingAdmissions = 0
    const addBulkSpy = vi.spyOn(voteAggregation, 'addBulk').mockImplementation(jobs => {
      if (
        jobs.some(
          job =>
            job.name === VOTE_AGGREGATION_UPDATE_ELECTION_JOB.name &&
            typeof job.data === 'object' &&
            job.data !== null &&
            'electionId' in job.data &&
            job.data.electionId === target.id &&
            'orderingKey' in job.data &&
            job.data.orderingKey === 'user_vouch',
        )
      ) {
        matchingAdmissions += 1
        return Promise.reject(admissionError)
      }
      return originalAddBulk.call(voteAggregation, jobs)
    })

    try {
      const votes = await upsertUserVouchElectionVotes(voter.id, [
        { entityId: target.id, score: 1 },
      ])
      expect(votes).toEqual([expect.objectContaining({ entity_id: target.id, score: 1 })])
      await expect(getUserVouchElectionVote(voter.id, target.id)).resolves.toMatchObject({
        entity_id: target.id,
        user_id: voter.id,
        choice: 'like',
      })
      expect(matchingAdmissions).toBe(1)
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportsBefore)
          .filter(([reportedError]) => reportedError === admissionError),
      ).toHaveLength(1)
    } finally {
      addBulkSpy.mockRestore()
    }
  })
})
