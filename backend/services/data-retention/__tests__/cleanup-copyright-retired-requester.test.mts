import { describe, expect, it } from 'vitest'
import {
  createTestRetentionWindow,
  createTestUser,
  getTestUserRaw,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { seedCopyrightThreadRetirement } from '@voucha/test-helpers/copyright-operational-email-retention'
import { readRetiredCopyrightRequesterState } from '@voucha/test-helpers/copyright-thread-preservation-fixture'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'

describe('copyright requester privacy erasure', () => {
  it('purges a retired-case requester without deleting the retained case or its party identity', async () => {
    const claimant = await createTestUser()
    const { intake } = await createSignedInCopyrightForm(1, { claimant })
    await seedCopyrightThreadRetirement(intake.copyright_notice_id, intake.id)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(claimant.id, window.firstEligibleDate)
    await expect(
      cleanupSoftDeletedUser(claimant.id, window.upperBoundDate, window.lowerBoundDate),
    ).resolves.toEqual({ deleted: 1, hasMore: false })
    expect(await getTestUserRaw(claimant.id)).toBeNull()
    expect(
      await readRetiredCopyrightRequesterState(intake.copyright_notice_id, intake.id, claimant.id),
    ).toEqual({
      requester_id: null,
      case_retained: true,
      identity_retained: true,
      retired: true,
      party_retained: true,
    })
  })
})
