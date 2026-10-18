import { randomInt } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { getTestUserRaw } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestPasskeyVoteWeightDirtyUser,
  createTestVerifiedPasskeyRegistration,
} from '@voucha/test-helpers/passkey-registration'
import { holdBackgroundDomain } from '../../../test-helpers/shared-background-worker.mts'
import { dispatchVoteWeightDirtyMarkers } from '../vote-weight/dispatch-dirty-markers.mts'
import { recalculateUserVoteWeight } from '../vote-weight/update.mts'
import { voteWeightWorkConfig } from '../vote-weight/work-limits.mts'
import { deletePasskeyWithMfaProtection } from '../mfa/protected-mfa-delete.mts'
import { createPasskey } from './create.mts'
import { deletePasskey } from './delete.mts'

describe('passkey vote-weight dirty markers', () => {
  it('marks create, standalone delete, and protected delete in their mutations', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, { dispatch_batch_size: 1 }),
    )
    const at = new Date(Date.UTC(2005, 0, 1) + randomInt(0, 30_000_000))
    const { userId, afterId } = await createTestPasskeyVoteWeightDirtyUser(at)
    const dirtyEvent = { userId, jobId: `voteWeight__${userId}__dirtyMarker` }
    await recalculateUserVoteWeight(userId)
    const release = holdBackgroundDomain('vote-aggregation')
    try {
      const created = await createPasskey(userId, createTestVerifiedPasskeyRegistration(), 'First')
      expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeNull()
      expect((await dispatchVoteWeightDirtyMarkers({ afterId })).events).toContainEqual(dirtyEvent)
      await recalculateUserVoteWeight(userId)

      await deletePasskey(userId, created.id)
      expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeNull()
      expect((await dispatchVoteWeightDirtyMarkers({ afterId })).events).toContainEqual(dirtyEvent)
      await recalculateUserVoteWeight(userId)

      const protectedPasskey = await createPasskey(
        userId,
        createTestVerifiedPasskeyRegistration(),
        'Protected',
      )
      await createPasskey(userId, createTestVerifiedPasskeyRegistration(), 'Other')
      await recalculateUserVoteWeight(userId)
      await deletePasskeyWithMfaProtection(userId, protectedPasskey.id, undefined)
      expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeNull()
      expect((await dispatchVoteWeightDirtyMarkers({ afterId })).events).toContainEqual(dirtyEvent)
      await recalculateUserVoteWeight(userId)
      expect((await getTestUserRaw(userId))?.vote_weight_recalculated_at).toBeInstanceOf(Date)
    } finally {
      release()
    }
  })
})
