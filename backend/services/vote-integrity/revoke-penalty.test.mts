import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestVoteWeightPenalty,
  safeUsername,
} from '@voucha/test-helpers'
import { revokeVoteWeightPenalty } from './revoke-penalty.mts'

describe('revokeVoteWeightPenalty', () => {
  it('revokes an active vote-weight penalty', async () => {
    const [penalizedUser, adminUser] = await Promise.all([
      createTestUserDirect({ username: safeUsername('revoke-penalty-user') }),
      createTestUserDirect({ username: safeUsername('revoke-penalty-admin') }),
    ])
    const penaltyId = await insertTestVoteWeightPenalty(penalizedUser!.id, adminUser!.id)

    const revoked = await revokeVoteWeightPenalty(penaltyId, adminUser!.id)

    expect(revoked.id).toBe(penaltyId)
    expect(revoked.user_id).toBe(penalizedUser!.id)
    expect(revoked.revoked_by_id).toBe(adminUser!.id)
    expect(revoked.revoked_at).toBeInstanceOf(Date)
  })

  it('rejects a second revoke of the same penalty', async () => {
    const [penalizedUser, adminUser] = await Promise.all([
      createTestUserDirect({ username: safeUsername('re-revoke-penalty-user') }),
      createTestUserDirect({ username: safeUsername('re-revoke-penalty-admin') }),
    ])
    const penaltyId = await insertTestVoteWeightPenalty(penalizedUser!.id, adminUser!.id)

    await revokeVoteWeightPenalty(penaltyId, adminUser!.id)

    await expect(revokeVoteWeightPenalty(penaltyId, adminUser!.id)).rejects.toMatchObject({
      status: 404,
    })
  })
})
