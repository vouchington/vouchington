import { describe, expect, it } from 'vitest'
import {
  createTestRetentionWindow,
  createTestUserDirect,
  getTestUserRaw,
  insertTestVoteWeightPenalty,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { cleanupSoftDeletedUser } from '@services/data-retention/cleanup-soft-deleted-user'
import { gatherVoteWeightFactors } from '@services/vote-weight/gather-factors'
import { getVoteWeightPenaltyByIdFromPrimary } from './get-penalties.mts'

describe('vote-weight penalty creator purge', () => {
  it('keeps an active penalty after its creating administrator is purged', async () => {
    const [administrator, penalizedUser] = await Promise.all([
      createTestUserDirect({ administrator: true }),
      createTestUserDirect(),
    ])
    if (!administrator || !penalizedUser) throw new Error('Failed to create test users')

    const penaltyId = await insertTestVoteWeightPenalty(penalizedUser.id, administrator.id, 0.2)
    expect(
      (await gatherVoteWeightFactors(penalizedUser.id, { readFromWriter: true }))
        ?.penaltyMultiplier,
    ).toBeCloseTo(0.2)

    const window = createTestRetentionWindow()
    await softDeleteUserAt(administrator.id, window.firstEligibleDate)
    await expect(
      cleanupSoftDeletedUser(administrator.id, window.upperBoundDate, window.lowerBoundDate),
    ).resolves.toEqual({ deleted: 1, hasMore: false })

    expect(await getTestUserRaw(administrator.id)).toBeNull()
    await expect(getVoteWeightPenaltyByIdFromPrimary(penaltyId)).resolves.toMatchObject({
      id: penaltyId,
      user_id: penalizedUser.id,
      created_by_id: null,
      revoked_at: null,
    })
    expect(
      (await gatherVoteWeightFactors(penalizedUser.id, { readFromWriter: true }))
        ?.penaltyMultiplier,
    ).toBeCloseTo(0.2)
  })
})
