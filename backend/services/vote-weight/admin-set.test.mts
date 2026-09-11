import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createTestUserDirect } from '@voucha/test-helpers'
import { adminSetVoteWeight, adminClearVoteWeight } from './admin-set.mts'
import { gatherVoteWeightFactors } from './gather-factors.mts'

const randomUsername = () => `test-vote-weight-admin-${randomBytes(4).toString('hex')}`

describe('adminSetVoteWeight', () => {
  it('sets vote_weight and vote_weight_admin_set_at on the user', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const userId = user!.id

    await adminSetVoteWeight(userId, 5.5)

    const factors = await gatherVoteWeightFactors(userId)
    expect(factors?.current_weight).toBe(5.5)
    expect(factors?.vote_weight_admin_set_at).not.toBeNull()
  }, 60_000)

  it('overwrites a previously set admin weight', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const userId = user!.id

    await adminSetVoteWeight(userId, 3.0)
    await adminSetVoteWeight(userId, 7.25)

    const factors = await gatherVoteWeightFactors(userId)
    expect(factors?.current_weight).toBe(7.25)
    expect(factors?.vote_weight_admin_set_at).not.toBeNull()
  }, 60_000)
})

describe('adminClearVoteWeight', () => {
  it('clears vote_weight_admin_set_at after adminSetVoteWeight', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const userId = user!.id

    await adminSetVoteWeight(userId, 5.5)

    const factorsBefore = await gatherVoteWeightFactors(userId)
    expect(factorsBefore?.vote_weight_admin_set_at).not.toBeNull()

    await adminClearVoteWeight(userId)

    const factorsAfter = await gatherVoteWeightFactors(userId)
    expect(factorsAfter?.vote_weight_admin_set_at).toBeNull()
    // vote_weight itself is left as-is; only the lock is cleared
    expect(factorsAfter?.current_weight).toBe(5.5)
  }, 60_000)

  it('is a no-op for a user without an admin weight set', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const userId = user!.id

    // Should not throw
    await expect(adminClearVoteWeight(userId)).resolves.toBeUndefined()

    const factors = await gatherVoteWeightFactors(userId)
    expect(factors?.vote_weight_admin_set_at).toBeNull()
  }, 60_000)
})
