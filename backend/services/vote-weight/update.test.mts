import { describe, it, expect, onTestFinished } from 'vitest'
import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { v7 } from 'uuid'
import {
  createTestUserDirect,
  deleteTestOAuthAuthorizationFixtures,
  getTestUserRaw,
} from '@voucha/test-helpers'
import { createVoteWeightDispatchUserAt } from '@voucha/test-helpers/vote-weight-dispatch'
import { createVoteWeightRecalculationRaceQuery } from '@voucha/test-helpers/vote-weight-recalculation-race'
import {
  connectOAuthAccountToUser,
  runOAuthAccountConnectionPostCommitEffects,
} from '../oauth-accounts/connect.mts'
import { upsertOAuthAccount } from '../oauth-accounts/upsert.mts'
import { recalculateUserVoteWeight } from './update.mts'
import { adminSetVoteWeight } from './admin-set.mts'
import { gatherVoteWeightFactors } from './gather-factors.mts'
import { calculateVoteWeight } from './calculate.mts'
import { dispatchVoteWeightDirtyMarkers } from './dispatch-dirty-markers.mts'
import { voteWeightWorkConfig } from './work-limits.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

const randomUsername = () => `test-vote-weight-${randomBytes(4).toString('hex')}`

describe('recalculateUserVoteWeight', () => {
  it('returns weight for a basic user', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const result = await recalculateUserVoteWeight(user!.id)
    expect(result).toBeDefined()
    expect(typeof result.weight).toBe('number')
    // New accounts (< 7 days) get minimal weight (WEIGHT_NEW_ACCOUNT); this test only checks the return shape is valid
    expect(result.weight).toBeGreaterThan(0)
  })

  it('skips recalculation when vote_weight_admin_set_at is set (returns current weight unchanged)', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const userId = user!.id

    await adminSetVoteWeight(userId, userId, 999)

    const result = await recalculateUserVoteWeight(userId)
    // Should skip and return the current (admin-set) weight
    expect(result.weight).toBe(999)
    expect(result.changed).toBe(false)

    const factors = await gatherVoteWeightFactors(userId)
    expect(factors?.current_weight).toBe(999)
    expect(factors?.vote_weight_admin_set_at).not.toBeNull()
  })

  it('forceRecalculate clears admin override and calculates new weight', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const userId = user!.id

    await adminSetVoteWeight(userId, userId, 999)

    const result = await recalculateUserVoteWeight(userId, { forceRecalculate: true })
    // Should recalculate (not 999) and clear admin_set_at
    expect(result.weight).not.toBe(999)

    const factors = await gatherVoteWeightFactors(userId)
    expect(factors?.current_weight).toBe(result.weight)
    expect(factors?.vote_weight_admin_set_at).toBeNull()
  })

  it('returns changed=true when weight changes (admin user has elevated weight)', async () => {
    const user = await createTestUserDirect({ username: randomUsername(), administrator: true })
    const userId = user!.id

    // Force weight to 1.0 via admin set then force recalculate
    await adminSetVoteWeight(userId, userId, 1.0)

    const result = await recalculateUserVoteWeight(userId, { forceRecalculate: true })
    // Admin multiplier is 10000, so weight >> 1.0
    expect(result.weight).toBeGreaterThan(1.0)
    expect(result.changed).toBe(true)
  })

  it('returns changed=false when weight is already correct', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const userId = user!.id

    // First recalculate to set the correct weight
    const first = await recalculateUserVoteWeight(userId)

    // Second recalculate should find the weight unchanged
    const second = await recalculateUserVoteWeight(userId)
    expect(second.weight).toBe(first.weight)
    expect(second.changed).toBe(false)
  })

  it('returns weight=1 and changed=false for non-existent user', async () => {
    const fakeId = v7() // fresh UUIDv7 used here as a stand-in for a non-existent user ID
    const result = await recalculateUserVoteWeight(fakeId)
    expect(result.weight).toBe(1)
    expect(result.changed).toBe(false)
  })

  it('keeps a newer OAuth dirty marker when an earlier factor gather races its connection', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, { dispatch_batch_size: 1 }),
    )
    const at = new Date(Date.UTC(2001, 1, 1) + randomInt(0, 30_000_000))
    const userId = await createVoteWeightDispatchUserAt(at)
    const afterId = v7({ msecs: at.getTime() - 1 })
    const providerUserId = `github-vote-weight-race-${randomUUID()}`
    onTestFinished(() =>
      deleteTestOAuthAuthorizationFixtures({ githubUserIds: [providerUserId], userIds: [userId] }),
    )
    const baseline = await recalculateUserVoteWeight(userId)
    await upsertOAuthAccount('github', providerUserId, `tests+${providerUserId}@voucha.ai`, {
      login: providerUserId,
    })
    const reported: Error[] = []
    const query = createVoteWeightRecalculationRaceQuery(async () => {
      await connectOAuthAccountToUser('github', userId, providerUserId)
      await runOAuthAccountConnectionPostCommitEffects(userId, {
        enqueueVoteWeightRecalculation: async () => {
          throw new Error('queue unavailable')
        },
        invalidateVerifiedEmail: async () => 0,
        reportError: error => {
          reported.push(error)
        },
      })
    })

    await expect(recalculateUserVoteWeight(userId, { query })).rejects.toThrow(/raced/)
    expect(reported).toHaveLength(1)
    const latestFactors = await gatherVoteWeightFactors(userId, { readFromWriter: true })
    expect(latestFactors?.oauthCount).toBe(1)
    expect(latestFactors?.current_weight).toBe(baseline.weight)
    expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeNull()

    const dirtyEvent = { userId, jobId: `voteWeight__${userId}__dirtyMarker` }
    expect((await dispatchVoteWeightDirtyMarkers({ afterId })).events).toContainEqual(dirtyEvent)
    const repaired = await recalculateUserVoteWeight(userId)
    expect(repaired.weight).toBe(calculateVoteWeight(latestFactors!))
    const savedFactors = await gatherVoteWeightFactors(userId, { readFromWriter: true })
    expect(savedFactors?.current_weight).toBe(repaired.weight)
    expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeInstanceOf(Date)
    expect((await dispatchVoteWeightDirtyMarkers({ afterId })).events).not.toContainEqual(
      dirtyEvent,
    )
  })

  it('retries a forced recalculation from current facts after a concurrent administrator write', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    await recalculateUserVoteWeight(user.id)
    const query = createVoteWeightRecalculationRaceQuery(() =>
      adminSetVoteWeight(user.id, user.id, 999),
    )

    await expect(
      recalculateUserVoteWeight(user.id, { forceRecalculate: true, query }),
    ).rejects.toThrow(/raced/)
    const factors = await gatherVoteWeightFactors(user.id, { readFromWriter: true })
    expect(factors?.current_weight).toBe(999)
    expect(factors?.vote_weight_admin_set_at).toBeInstanceOf(Date)
    expect((await getTestUserRaw(user.id))?.vote_weight_recalculated_at).toBeNull()
    await recalculateUserVoteWeight(user.id, { forceRecalculate: true })
    const retried = await gatherVoteWeightFactors(user.id, { readFromWriter: true })
    expect(retried?.vote_weight_admin_set_at).toBeNull()
    expect((await getTestUserRaw(user.id))?.vote_weight_recalculated_at).toBeInstanceOf(Date)
  })
})
