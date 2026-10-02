import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { eraseTestSuspendingAdministrator } from '@voucha/test-helpers/services/copyright-notices/claimant-abuse-fixtures'
import { readTestClaimantSuspensionReversal } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding-reads'
import { enableAutomaticProvisionalWithholdingForTest } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import { suspendUser, unsuspendUser } from '@services/users/suspension'
import { readClaimantMisuseSummary } from './claimant-misuse-summary.mts'
import {
  liftSuspendedClaimantAutomaticRestrictions,
  searchSuspendedClaimantAutomaticRestrictionNoticeIds,
} from './claimant-suspension-lifts.mts'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'
import { completeCopyrightMandatoryHumanReview } from './human-review.mts'

/**
 * A signed-in notice that automatic withholding restricted while the switch was on. The switch is
 * back off by the time this returns, because lifting a suspended claimant's restrictions must not
 * depend on it.
 */
async function automaticallyRestrictedNotice() {
  const claimant = await createTestUser()
  const { notice } = await createClearScreenedForm(1, { claimant })
  const restoreSwitch = await enableAutomaticProvisionalWithholdingForTest()
  try {
    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
  } finally {
    restoreSwitch()
  }
  const noticeId = notice.intake.copyright_notice_id
  const restriction = (await getCopyrightNoticePrivateAggregate(noticeId))?.restrictions[0]
  if (!restriction) throw new Error('fixture restriction missing')
  return { claimant, noticeId, restriction }
}

async function readRestriction(noticeId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  return aggregate!.restrictions[0]!
}

function listedBySweep(noticeId: string): Promise<string[]> {
  return readTestOwnedCopyrightSweepIds(
    searchSuspendedClaimantAutomaticRestrictionNoticeIds,
    noticeId,
  )
}

async function suspendClaimant(claimantId: string) {
  const admin = await createTestUser({ administrator: true })
  await suspendUser(admin, claimantId, 'allow', 'Misused the copyright notice form')
  return admin
}

describe('lifting a suspended claimant automatic restrictions', () => {
  it('reverses a pending automatic restriction through the reversal path and records why', async () => {
    const { claimant, noticeId, restriction } = await automaticallyRestrictedNotice()
    const admin = await suspendClaimant(claimant.id)

    await expect(listedBySweep(noticeId)).resolves.toEqual([noticeId])
    await liftSuspendedClaimantAutomaticRestrictions(noticeId)

    await expect(readRestriction(noticeId)).resolves.toMatchObject({
      human_review_action: 'reverse',
      human_reviewed_by_id: admin.id,
    })
    await expect(readTestClaimantSuspensionReversal(restriction.id)).resolves.toEqual({
      recorded: true,
      restoreIntents: 1,
    })
    await expect(listedBySweep(noticeId)).resolves.toEqual([])
    await expect(readClaimantMisuseSummary(claimant.id)).resolves.toMatchObject({
      notice_rejected: 0,
      restriction_reversed_by_appeal: 0,
    })
  })

  it('lifts with the switch off, and replays as a no-op', async () => {
    const { claimant, noticeId, restriction } = await automaticallyRestrictedNotice()
    await suspendClaimant(claimant.id)

    await liftSuspendedClaimantAutomaticRestrictions(noticeId)
    await liftSuspendedClaimantAutomaticRestrictions(noticeId)

    await expect(readTestClaimantSuspensionReversal(restriction.id)).resolves.toEqual({
      recorded: true,
      restoreIntents: 1,
    })
  })

  it('leaves the restriction alone while the claimant is not suspended', async () => {
    const { noticeId, restriction } = await automaticallyRestrictedNotice()

    await expect(listedBySweep(noticeId)).resolves.toEqual([])
    await liftSuspendedClaimantAutomaticRestrictions(noticeId)

    await expect(readRestriction(noticeId)).resolves.toMatchObject({ human_review_action: null })
    await expect(readTestClaimantSuspensionReversal(restriction.id)).resolves.toEqual({
      recorded: false,
      restoreIntents: 0,
    })
  })

  it('leaves the restriction alone once the suspension is lifted', async () => {
    const { claimant, noticeId } = await automaticallyRestrictedNotice()
    const admin = await suspendClaimant(claimant.id)
    await unsuspendUser(admin, claimant.id)

    await expect(listedBySweep(noticeId)).resolves.toEqual([])
    await liftSuspendedClaimantAutomaticRestrictions(noticeId)

    await expect(readRestriction(noticeId)).resolves.toMatchObject({ human_review_action: null })
  })

  it('keeps a restriction a moderator already confirmed', async () => {
    const { claimant, noticeId, restriction } = await automaticallyRestrictedNotice()
    await completeCopyrightMandatoryHumanReview({
      currentUser: await createTestCopyrightStaff(),
      noticeId,
      restrictionId: restriction.id,
      action: 'confirm',
      rationale: 'The notice is well founded.',
      reviewedAt: new Date(),
    })
    await suspendClaimant(claimant.id)

    await expect(listedBySweep(noticeId)).resolves.toEqual([])
    await liftSuspendedClaimantAutomaticRestrictions(noticeId)

    await expect(readRestriction(noticeId)).resolves.toMatchObject({
      human_review_action: 'confirm',
    })
    await expect(readTestClaimantSuspensionReversal(restriction.id)).resolves.toMatchObject({
      recorded: false,
    })
  })

  it('leaves a suspension whose administrator was erased to a moderator', async () => {
    const { claimant, noticeId } = await automaticallyRestrictedNotice()
    await suspendClaimant(claimant.id)
    await eraseTestSuspendingAdministrator(claimant.id)

    await expect(listedBySweep(noticeId)).resolves.toEqual([])
    await liftSuspendedClaimantAutomaticRestrictions(noticeId)

    await expect(readRestriction(noticeId)).resolves.toMatchObject({ human_review_action: null })
  })
})
