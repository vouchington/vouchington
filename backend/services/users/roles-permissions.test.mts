import { randomInt } from 'node:crypto'
import { v7 } from 'uuid'
import { it, expect, describe, beforeAll, onTestFinished } from 'vitest'
import { countUserRoleAssignments, createTestUser, getTestUserRaw } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createVoteWeightDispatchUserAt } from '@voucha/test-helpers/vote-weight-dispatch'
import { createVoteWeightRecalculationRaceQuery } from '@voucha/test-helpers/vote-weight-recalculation-race'
import { holdBackgroundDomain } from '../../../test-helpers/shared-background-worker.mts'
import { dispatchVoteWeightDirtyMarkers } from '../vote-weight/dispatch-dirty-markers.mts'
import { recalculateUserVoteWeight } from '../vote-weight/update.mts'
import { voteWeightWorkConfig } from '../vote-weight/work-limits.mts'
import { addUserRole } from './roles-permissions.mts'
import type { PrivateUser } from '@services/users/types'

describe('roles-permissions', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('addUserRole', () => {
    it('is idempotent for the same user and role', async () => {
      await addUserRole(user.id, 'administrator')
      await addUserRole(user.id, 'administrator')

      const count = await countUserRoleAssignments(user.id, 'administrator')
      expect(count).toBe(1)
    })

    it('keeps a role grant dirty when it races vote-weight factor gathering', async () => {
      onTestFinished(
        overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, { dispatch_batch_size: 1 }),
      )
      const at = new Date(Date.UTC(2004, 0, 1) + randomInt(0, 30_000_000))
      const userId = await createVoteWeightDispatchUserAt(at)
      const afterId = v7({ msecs: at.getTime() - 1 })
      const baseline = await recalculateUserVoteWeight(userId)
      const release = holdBackgroundDomain('vote-aggregation')
      try {
        const query = createVoteWeightRecalculationRaceQuery(() =>
          addUserRole(userId, 'administrator'),
        )
        await expect(recalculateUserVoteWeight(userId, { query })).rejects.toThrow(/raced/)
        expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeNull()
        const dirtyEvent = { userId, jobId: `voteWeight__${userId}__dirtyMarker` }
        expect((await dispatchVoteWeightDirtyMarkers({ afterId })).events).toContainEqual(
          dirtyEvent,
        )
        const repaired = await recalculateUserVoteWeight(userId)
        expect(repaired.weight).toBeGreaterThan(baseline.weight)
        expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeInstanceOf(Date)
      } finally {
        await release()
      }
    })
  })
})
