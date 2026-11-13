import { describe, expect, it } from 'vitest'
import { createTestRetentionWindow, createTestUser, softDeleteUserAt } from '@voucha/test-helpers'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { seedCopyrightThreadRetirement } from '@voucha/test-helpers/copyright-operational-email-retention'
import {
  readRetiredRequesterCleanupState,
  completedRetiredRequesterCleanupState,
  abortRetiredRequesterPurgeAfterDelete,
} from '@voucha/test-helpers/copyright-retired-requester-cleanup'
import {
  createRetiredRequesterPurgeCursor,
  readRetiredRequesterCursorRows,
} from '@voucha/test-helpers/copyright-retired-requester-cursor'
import { cleanupSoftDeletedUserBatch } from '../cleanup-batches.mts'

describe('copyright requester privacy erasure', () => {
  it('purges a retired-case requester without deleting the retained case or its party identity', async () => {
    const claimant = await createTestUser()
    const { intake } = await createSignedInCopyrightForm(1, { claimant })
    await seedCopyrightThreadRetirement(intake.copyright_notice_id, intake.id)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(claimant.id, window.firstEligibleDate)
    const before = await readRetiredRequesterCleanupState(
      intake.copyright_notice_id,
      intake.id,
      claimant.id,
    )
    expect(before.retained).toEqual({
      requester_id: claimant.id,
      case_retained: true,
      identity_retained: true,
      retired: true,
      party_retained: true,
    })
    const result = await cleanupSoftDeletedUserBatch(
      window.upperBoundDate,
      1000,
      window.lowerBoundDate,
      undefined,
      [claimant.id],
    )
    const state = await readRetiredRequesterCleanupState(
      intake.copyright_notice_id,
      intake.id,
      claimant.id,
    )
    // An SSI abort leaves the entire owned page discoverable; a commit deletes the account,
    // clears live requester FKs, and preserves the retired case and its retained party identity.
    expect([
      { result: { deleted: 0, hasMore: false }, state: before },
      {
        result: { deleted: 1, hasMore: false },
        state: completedRetiredRequesterCleanupState(before, claimant.id),
      },
    ]).toContainEqual({ result, state })
  })

  it('stops after a native serialization abort and rolls back the account deletion and requester FK effects', async () => {
    const claimant = await createTestUser()
    const { intake } = await createSignedInCopyrightForm(1, { claimant })
    await seedCopyrightThreadRetirement(intake.copyright_notice_id, intake.id)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(claimant.id, window.firstEligibleDate)
    const before = await readRetiredRequesterCleanupState(
      intake.copyright_notice_id,
      intake.id,
      claimant.id,
    )
    const fault = abortRetiredRequesterPurgeAfterDelete(claimant.id)
    try {
      await expect(
        cleanupSoftDeletedUserBatch(window.upperBoundDate, 1000, window.lowerBoundDate, undefined, [
          claimant.id,
        ]),
      ).resolves.toEqual({ deleted: 0, hasMore: false })
      expect(fault.observedCode()).toBe('40001')
    } finally {
      fault.restore()
    }
    expect(
      await readRetiredRequesterCleanupState(intake.copyright_notice_id, intake.id, claimant.id),
    ).toEqual(before)
  })

  it('stops an aborted real moderator continuation without consuming its cursor or archive effects', async () => {
    const claimant = await createTestUser()
    const { intake } = await createSignedInCopyrightForm(1, { claimant })
    await seedCopyrightThreadRetirement(intake.copyright_notice_id, intake.id)
    const { cursor, moderatorId } = await createRetiredRequesterPurgeCursor(claimant.id)
    const cursorBefore = structuredClone(cursor)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(claimant.id, window.firstEligibleDate)
    const before = await readRetiredRequesterCleanupState(
      intake.copyright_notice_id,
      intake.id,
      claimant.id,
    )
    const communityBefore = await readRetiredRequesterCursorRows(
      cursor.communityId,
      claimant.id,
      moderatorId,
    )
    const fault = abortRetiredRequesterPurgeAfterDelete(claimant.id, 'archive')
    try {
      await expect(
        cleanupSoftDeletedUserBatch(window.upperBoundDate, 1, window.lowerBoundDate, cursor, [
          claimant.id,
        ]),
      ).resolves.toEqual({ deleted: 0, hasMore: false, userPurge: cursorBefore })
      expect(fault.observedCode()).toBe('40001')
    } finally {
      fault.restore()
    }
    expect(
      await readRetiredRequesterCleanupState(intake.copyright_notice_id, intake.id, claimant.id),
    ).toEqual(before)
    expect(cursor).toEqual(cursorBefore)
    expect(
      await readRetiredRequesterCursorRows(cursorBefore.communityId, claimant.id, moderatorId),
    ).toEqual(communityBefore)
  })
})
