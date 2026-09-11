import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { voteWeightQueue } from '@queues/vote-weight/queues'
import { processRecalculateVoteWeightDispatcher } from './processors.mts'

describe('vote weight dispatcher processor', () => {
  it('enqueues users needing vote-weight recalculation before returning', async () => {
    // The dispatcher scans users by id ASC in batches of 500, re-enqueueing itself for the
    // rest. UUIDv7 ids are time-ordered, so on a populated test DB a cursor-less dispatch
    // covers only the oldest 500 users and never reaches a fresh fixture. Anchor the cursor
    // at a user created just before the target so the target lands in the first batch.
    const cursorUser = await createTestUser()
    const user = await createTestUser()
    expect(user).toBeTruthy()

    await processRecalculateVoteWeightDispatcher({ afterId: cursorUser!.id })

    const waiting = await voteWeightQueue.getJobs('waiting')
    expect(
      waiting.some(
        job =>
          job.name === 'processRecalculateUserVoteWeight' &&
          (job.data as { userId?: string }).userId === user!.id,
      ),
    ).toBe(true)
  })
})
