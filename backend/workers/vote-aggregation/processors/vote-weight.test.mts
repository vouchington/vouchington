import { adminSetVoteWeight } from '@services/vote-weight/admin-set'
import { readAdminWorkflowVoteWeight } from '@voucha/test-helpers/admin-workflow-fixtures'
import { describe, expect, it } from 'vitest'
import { createTestUser, readAllQueueJobs } from '@voucha/test-helpers'
import { VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import {
  processRecalculateUserVoteWeight,
  processRecalculateVoteWeightDispatcher,
} from './vote-weight.mts'

describe('vote weight dispatcher processor', () => {
  it('replays election targets without clearing an administrator weight override', async () => {
    const user = await createTestUser()
    await adminSetVoteWeight(user.id, user.id, 7.25)
    const before = await readAdminWorkflowVoteWeight(user.id)
    expect(before.vote_weight_admin_set_at).not.toBeNull()
    await processRecalculateUserVoteWeight({ userId: user.id, replayElectionsOnly: true })
    await expect(readAdminWorkflowVoteWeight(user.id)).resolves.toEqual(before)
  })

  it('enqueues users needing vote-weight recalculation before returning', async () => {
    // The dispatcher scans users by id ASC in batches of 500, re-enqueueing itself for the
    // rest. UUIDv7 ids are time-ordered, so on a populated test DB a cursor-less dispatch
    // covers only the oldest 500 users and never reaches a fresh fixture. Anchor the cursor
    // at a user created just before the target so the target lands in the first batch.
    const cursorUser = await createTestUser()
    const user = await createTestUser()
    expect(user).toBeTruthy()

    await processRecalculateVoteWeightDispatcher({ afterId: cursorUser!.id })

    const waiting = await readAllQueueJobs(voteAggregation)
    expect(
      waiting.some(
        job =>
          job.name === VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB.name &&
          (job.data as { userId?: string }).userId === user!.id,
      ),
    ).toBe(true)
  })
})
