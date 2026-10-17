import { adminSetVoteWeight } from '@services/vote-weight/admin-set'
import { readAdminWorkflowVoteWeight } from '@voucha/test-helpers/admin-workflow-fixtures'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { processRecalculateUserVoteWeight } from './vote-weight.mts'

describe('vote weight dispatcher processor', () => {
  it('replays election targets without clearing an administrator weight override', async () => {
    const user = await createTestUser()
    await adminSetVoteWeight(user.id, user.id, 7.25)
    const before = await readAdminWorkflowVoteWeight(user.id)
    expect(before.vote_weight_admin_set_at).not.toBeNull()
    await processRecalculateUserVoteWeight({ userId: user.id, replayElectionsOnly: true })
    await expect(readAdminWorkflowVoteWeight(user.id)).resolves.toEqual(before)
  })
})
