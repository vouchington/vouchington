import { randomInt } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { getTestUserRaw } from '@voucha/test-helpers'
import { holdBackgroundDomain } from '../../../test-helpers/shared-background-worker.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createVoteWeightDispatchFamily } from '@voucha/test-helpers/vote-weight-dispatch'
import {
  withHeldFamilyVoteWeightCancellation,
  createFamilyVoteWeightDirtyUser,
} from '@voucha/test-helpers/vote-weight-family-dirty'
import { createVoteWeightRecalculationRaceQuery } from '@voucha/test-helpers/vote-weight-recalculation-race'
import { dispatchVoteWeightDirtyMarkers } from '../vote-weight/dispatch-dirty-markers.mts'
import { dispatchVoteWeightFamilySourceChanges } from '../vote-weight/dispatch-family-source-changes.mts'
import { gatherVoteWeightFactors } from '../vote-weight/gather-factors.mts'
import { recalculateUserVoteWeight } from '../vote-weight/update.mts'
import { voteWeightWorkConfig } from '../vote-weight/work-limits.mts'
import { rejectMembershipProviderEvidence } from './invalidate-provider-evidence.mts'

const FAMILY_BRANCH_ONLY = {
  effective_at: null,
  expires_at: null,
  rejected_at: null,
} as const

describe('family vote-weight dirty markers', () => {
  it('recovers a family change committed after its timestamp window was scanned', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, { dispatch_batch_size: 1 }),
    )
    const at = new Date(Date.UTC(2002, 0, 1) + randomInt(0, 30_000_000))
    const { userId, afterId } = await createFamilyVoteWeightDirtyUser(at)
    const family = await createVoteWeightDispatchFamily({
      userId,
      effectiveAt: new Date('2020-01-01T00:00:00.000Z'),
      expiresAt: new Date('2090-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    })
    const baseline = await recalculateUserVoteWeight(userId)
    const release = holdBackgroundDomain('vote-aggregation')
    try {
      const updatedAt = await withHeldFamilyVoteWeightCancellation(
        userId,
        family.sourceId,
        async uncommittedAt => {
          const before = await dispatchVoteWeightFamilySourceChanges({
            window: {
              windowStart: new Date(uncommittedAt.getTime() - 1).toISOString(),
              windowEnd: new Date(uncommittedAt.getTime() + 1).toISOString(),
            },
            branches: FAMILY_BRANCH_ONLY,
          })
          expect(before.events).not.toContainEqual(expect.objectContaining({ userId }))
        },
      )
      const missed = await dispatchVoteWeightFamilySourceChanges({
        window: {
          windowStart: new Date(updatedAt.getTime() + 121_000).toISOString(),
          windowEnd: new Date(updatedAt.getTime() + 122_000).toISOString(),
        },
        branches: FAMILY_BRANCH_ONLY,
      })
      expect(missed.events).not.toContainEqual(expect.objectContaining({ userId }))
      expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeNull()

      const dirtyEvent = { userId, jobId: `voteWeight__${userId}__dirtyMarker` }
      expect((await dispatchVoteWeightDirtyMarkers({ afterId })).events).toContainEqual(dirtyEvent)
      const repaired = await recalculateUserVoteWeight(userId)
      expect(repaired.weight).toBeLessThan(baseline.weight)
      expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeInstanceOf(Date)
    } finally {
      await release()
    }
  })

  it('preserves a rejected family marker when rejection races a factor gather', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, { dispatch_batch_size: 1 }),
    )
    const at = new Date(Date.UTC(2003, 0, 1) + randomInt(0, 30_000_000))
    const { userId, afterId } = await createFamilyVoteWeightDirtyUser(at)
    const family = await createVoteWeightDispatchFamily({
      userId,
      effectiveAt: new Date('2020-01-01T00:00:00.000Z'),
      expiresAt: new Date('2090-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    })
    const baseline = await recalculateUserVoteWeight(userId)
    const release = holdBackgroundDomain('vote-aggregation')
    try {
      const query = createVoteWeightRecalculationRaceQuery(async () => {
        await rejectMembershipProviderEvidence(family.evidenceId, 'Family evidence rejected')
      })
      await expect(recalculateUserVoteWeight(userId, { query })).rejects.toThrow(/raced/)
      expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeNull()
      const dirtyEvent = { userId, jobId: `voteWeight__${userId}__dirtyMarker` }
      expect((await dispatchVoteWeightDirtyMarkers({ afterId })).events).toContainEqual(dirtyEvent)
      const repaired = await recalculateUserVoteWeight(userId)
      const factors = await gatherVoteWeightFactors(userId, { readFromWriter: true })
      expect(factors?.current_weight).toBe(repaired.weight)
      expect(repaired.weight).toBeLessThan(baseline.weight)
      expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeInstanceOf(Date)
    } finally {
      await release()
    }
  })
})
