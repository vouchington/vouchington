import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  addVoteWeightSharedFamilyRecipient,
  createVoteWeightDispatchFamily,
  createVoteWeightDispatchUser,
  rejectVoteWeightEvidenceExact,
} from '@voucha/test-helpers/vote-weight-dispatch'
import { dispatchVoteWeightFamilySourceChanges } from './dispatch-family-source-changes.mts'
import { voteWeightWorkConfig } from './work-limits.mts'

describe('dispatchVoteWeightFamilySourceChanges', () => {
  it('keeps one continuation keyset per timestamp branch and stable overlap ids', async () => {
    const base = new Date(Date.UTC(2040, 7, 1) + randomInt(0, 30_000_000))
    const user = await createVoteWeightDispatchUser()
    const family = await createVoteWeightDispatchFamily({
      userId: user.id,
      updatedAt: new Date(base.getTime() + 1_000),
      effectiveAt: new Date(base.getTime() + 2_000),
      expiresAt: new Date(base.getTime() + 3_000),
    })
    await rejectVoteWeightEvidenceExact(
      family.evidenceId,
      new Date(base.getTime() + 4_000).toISOString(),
    )
    const window = {
      previousThroughAt: null,
      windowStart: base.toISOString(),
      windowEnd: new Date(base.getTime() + 5_000).toISOString(),
    }
    const restore = overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, {
      dispatch_batch_size: 1,
    })
    try {
      const full = await dispatchVoteWeightFamilySourceChanges({ window })
      expect(full.events).toEqual([
        {
          userId: user.id,
          jobId: `voteWeight__${user.id}__familySource__${family.sourceId}__${base.getTime() + 1_000}`,
        },
        {
          userId: user.id,
          jobId: `voteWeight__${user.id}__familySource__${family.sourceId}__${base.getTime() + 2_000}`,
        },
        {
          userId: user.id,
          jobId: `voteWeight__${user.id}__familySource__${family.sourceId}__${base.getTime() + 3_000}`,
        },
        {
          userId: user.id,
          jobId: `voteWeight__${user.id}__evidenceRejected__${family.evidenceId}`,
        },
      ])
      expect(full.hasMore).toBe(true)
      expect(Object.keys(full.continuation?.branches ?? {}).toSorted()).toEqual([
        'effective_at',
        'expires_at',
        'rejected_at',
        'updated_at',
      ])
      for (const branch of Object.values(full.continuation?.branches ?? {})) {
        expect(branch?.id).toBeTruthy()
      }

      const short = await dispatchVoteWeightFamilySourceChanges(full.continuation!)
      expect(short.events).toEqual([])
      expect(short.hasMore).toBe(true)
      const finished = await dispatchVoteWeightFamilySourceChanges(short.continuation!)
      expect(finished.events).toEqual([])
      expect(finished.hasMore).toBe(false)
      expect(finished.continuation).toBeNull()

      const overlap = await dispatchVoteWeightFamilySourceChanges({ window })
      expect(overlap.events).toEqual(full.events)
    } finally {
      restore()
    }
  })
  it('resumes within rejected evidence shared by two family recipients', async () => {
    const base = new Date(Date.UTC(2042, 0, 1) + randomInt(0, 30_000_000))
    const firstUser = await createVoteWeightDispatchUser()
    const secondUser = await createVoteWeightDispatchUser()
    const family = await createVoteWeightDispatchFamily({
      userId: firstUser.id,
      effectiveAt: base,
      expiresAt: new Date(base.getTime() + 60_000),
      updatedAt: base,
    })
    const secondSourceId = await addVoteWeightSharedFamilyRecipient(family.sourceId, secondUser.id)
    await rejectVoteWeightEvidenceExact(family.evidenceId, base.toISOString())
    const window = {
      previousThroughAt: null,
      windowStart: base.toISOString(),
      windowEnd: new Date(base.getTime() + 1).toISOString(),
    }
    const restore = overrideDynamicConfigFieldsForTest(voteWeightWorkConfig, {
      dispatch_batch_size: 1,
    })
    try {
      const first = await dispatchVoteWeightFamilySourceChanges({
        window,
        branches: { updated_at: null, effective_at: null, expires_at: null },
      })
      expect(first.events).toEqual([
        {
          userId: firstUser.id,
          jobId: `voteWeight__${firstUser.id}__evidenceRejected__${family.evidenceId}`,
        },
      ])
      expect(first.continuation?.branches?.rejected_at?.afterSourceId).toBe(family.sourceId)
      const second = await dispatchVoteWeightFamilySourceChanges(first.continuation!)
      expect(second.events).toEqual([
        {
          userId: secondUser.id,
          jobId: `voteWeight__${secondUser.id}__evidenceRejected__${family.evidenceId}`,
        },
      ])
      expect(second.continuation?.branches?.rejected_at?.afterSourceId).toBe(secondSourceId)
      const exhausted = await dispatchVoteWeightFamilySourceChanges(second.continuation!)
      expect(exhausted.events).toEqual([])
      const finished = await dispatchVoteWeightFamilySourceChanges(exhausted.continuation!)
      expect(finished.hasMore).toBe(false)
    } finally {
      restore()
    }
  })
})
