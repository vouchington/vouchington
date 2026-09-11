import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { v7 } from 'uuid'
import { createTestUserDirect } from '@voucha/test-helpers'
import { recalculateUserVoteWeight } from './update.mts'
import { adminSetVoteWeight } from './admin-set.mts'
import { gatherVoteWeightFactors } from './gather-factors.mts'

const randomUsername = () => `test-vote-weight-${randomBytes(4).toString('hex')}`

describe('recalculateUserVoteWeight', () => {
  it('returns weight for a basic user', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const result = await recalculateUserVoteWeight(user!.id)
    expect(result).toBeDefined()
    expect(typeof result.weight).toBe('number')
    // New accounts (< 7 days) get minimal weight (WEIGHT_NEW_ACCOUNT); this test only checks the return shape is valid
    expect(result.weight).toBeGreaterThan(0)
  }, 60_000)

  it('skips recalculation when vote_weight_admin_set_at is set (returns current weight unchanged)', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const userId = user!.id

    await adminSetVoteWeight(userId, 999)

    const result = await recalculateUserVoteWeight(userId)
    // Should skip and return the current (admin-set) weight
    expect(result.weight).toBe(999)
    expect(result.changed).toBe(false)

    const factors = await gatherVoteWeightFactors(userId)
    expect(factors?.current_weight).toBe(999)
    expect(factors?.vote_weight_admin_set_at).not.toBeNull()
  }, 60_000)

  it('forceRecalculate clears admin override and calculates new weight', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const userId = user!.id

    await adminSetVoteWeight(userId, 999)

    const result = await recalculateUserVoteWeight(userId, { forceRecalculate: true })
    // Should recalculate (not 999) and clear admin_set_at
    expect(result.weight).not.toBe(999)

    const factors = await gatherVoteWeightFactors(userId)
    expect(factors?.current_weight).toBe(result.weight)
    expect(factors?.vote_weight_admin_set_at).toBeNull()
  }, 60_000)

  it('returns changed=true when weight changes (admin user has elevated weight)', async () => {
    const user = await createTestUserDirect({ username: randomUsername(), administrator: true })
    const userId = user!.id

    // Force weight to 1.0 via admin set then force recalculate
    await adminSetVoteWeight(userId, 1.0)

    const result = await recalculateUserVoteWeight(userId, { forceRecalculate: true })
    // Admin multiplier is 10000, so weight >> 1.0
    expect(result.weight).toBeGreaterThan(1.0)
    expect(result.changed).toBe(true)
  }, 60_000)

  it('returns changed=false when weight is already correct', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const userId = user!.id

    // First recalculate to set the correct weight
    const first = await recalculateUserVoteWeight(userId)

    // Second recalculate should find the weight unchanged
    const second = await recalculateUserVoteWeight(userId)
    expect(second.weight).toBe(first.weight)
    expect(second.changed).toBe(false)
  }, 60_000)

  it('returns weight=1 and changed=false for non-existent user', async () => {
    const fakeId = v7() // fresh UUIDv7 used here as a stand-in for a non-existent user ID
    const result = await recalculateUserVoteWeight(fakeId)
    expect(result.weight).toBe(1)
    expect(result.changed).toBe(false)
  }, 60_000)
})
