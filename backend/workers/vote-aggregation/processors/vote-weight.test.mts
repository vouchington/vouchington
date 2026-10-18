import { adminSetVoteWeight } from '@services/vote-weight/admin-set'
import { readAdminWorkflowVoteWeight } from '@voucha/test-helpers/admin-workflow-fixtures'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createFailedOAuthVoteWeightEnqueueFixture } from '@voucha/test-helpers/vote-weight-dirty-marker'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { voteWeightWorkConfig } from '@services/vote-weight/work-limits'
import { gatherVoteWeightFactors } from '@services/vote-weight/gather-factors'
import { calculateVoteWeight } from '@services/vote-weight/calculate'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { processRecalculateUserVoteWeight, processVoteWeightDirtyMarkers } from './vote-weight.mts'

describe('vote weight dispatcher processor', () => {
  it('replays election targets without clearing an administrator weight override', async () => {
    const user = await createTestUser()
    await adminSetVoteWeight(user.id, user.id, 7.25)
    const before = await readAdminWorkflowVoteWeight(user.id)
    expect(before.vote_weight_admin_set_at).not.toBeNull()
    await processRecalculateUserVoteWeight({ userId: user.id, replayElectionsOnly: true })
    await expect(readAdminWorkflowVoteWeight(user.id)).resolves.toEqual(before)
  })

  it('recovers a committed OAuth link after its post-commit enqueue fails', async () => {
    const fixture = await createFailedOAuthVoteWeightEnqueueFixture()
    onTestFinished(fixture.cleanup)
    onTestFinished(
      overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, { dispatch_batch_size: 1 }),
    )
    expect(fixture.reportedErrors).toHaveLength(1)
    expect((await fixture.getUser())?.vote_weight_recalculated_at).toBeNull()

    await processVoteWeightDirtyMarkers({ afterId: fixture.afterId })
    const job = await voteAggregation.getJob(`voteWeight__${fixture.userId}__dirtyMarker`)
    expect(job?.data).toMatchObject({ userId: fixture.userId })
    await processRecalculateUserVoteWeight({ userId: fixture.userId })

    const user = await fixture.getUser()
    expect(user?.vote_weight_recalculated_at).toBeInstanceOf(Date)
    const factors = await gatherVoteWeightFactors(fixture.userId, { readFromWriter: true })
    expect(factors).not.toBeNull()
    const savedWeight = await readAdminWorkflowVoteWeight(fixture.userId)
    expect(savedWeight.vote_weight).toBe(calculateVoteWeight(factors!))
  })
})
