import {
  assertServiceClaimantSuspensionLift,
  assertServiceClaimantSuspensionNoop,
} from '@voucha/test-helpers/copyright-service-suspension-outcome'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { eraseTestSuspendingAdministrator } from '@voucha/test-helpers/services/copyright-notices/claimant-abuse-fixtures'
import { readTestClaimantSuspensionReversal } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding-reads'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { readTestOwnedCopyrightSweepIds } from '@voucha/test-helpers/services/copyright-notices/sweep-ids'
import { suspendUser, unsuspendUser } from '@services/users/suspension'
import { searchSuspendedClaimantAutomaticRestrictionNoticeIds } from './claimant-suspension-lifts.mts'
import {
  seedServiceReviewRestriction,
  seedServiceSuspensionReversal,
} from '@voucha/test-helpers/copyright-service-review-prerequisites'
import { seedEffectiveConfirmation } from '@voucha/test-helpers/copyright-effective-review-decisions'

/**
 * A signed-in notice that automatic withholding restricted while the switch was on. The switch is
 * back off by the time this returns, because lifting a suspended claimant's restrictions must not
 * depend on it.
 */
async function automaticallyRestrictedNotice() {
  const claimant = await createTestUser()
  const { notice, screeningId } = await createClearScreenedForm(1, { claimant })
  await seedServiceReviewRestriction(notice, await createTestCopyrightStaff(), screeningId)
  const noticeId = notice.intake.copyright_notice_id
  const restriction = (await getCopyrightNoticePrivateAggregate(noticeId))?.restrictions[0]
  if (!restriction) throw new Error('fixture restriction missing')
  return { claimant, noticeId, restriction, notice }
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
    await assertServiceClaimantSuspensionLift({
      noticeId,
      restrictionId: restriction.id,
      claimantId: claimant.id,
      moderatorId: admin.id,
    })
  })

  it('lifts with the switch off, and replays as a no-op', async () => {
    expect.hasAssertions()
    const { claimant, noticeId, restriction, notice } = await automaticallyRestrictedNotice()
    const admin = await suspendClaimant(claimant.id)
    await seedServiceSuspensionReversal(notice, admin.id)
    await assertServiceClaimantSuspensionLift({
      noticeId,
      restrictionId: restriction.id,
      claimantId: claimant.id,
      moderatorId: admin.id,
    })
  })

  it('leaves the restriction alone while the claimant is not suspended', async () => {
    const { noticeId, restriction } = await automaticallyRestrictedNotice()

    await expect(listedBySweep(noticeId)).resolves.toEqual([])
    await assertServiceClaimantSuspensionNoop(noticeId, restriction.id)

    await expect(readRestriction(noticeId)).resolves.toMatchObject({ human_review_action: null })
    await expect(readTestClaimantSuspensionReversal(restriction.id)).resolves.toEqual({
      recorded: false,
      restoreIntents: 0,
    })
  })

  it('leaves the restriction alone once the suspension is lifted', async () => {
    const { claimant, noticeId, restriction } = await automaticallyRestrictedNotice()
    const admin = await suspendClaimant(claimant.id)
    await unsuspendUser(admin, claimant.id)

    await expect(listedBySweep(noticeId)).resolves.toEqual([])
    await assertServiceClaimantSuspensionNoop(noticeId, restriction.id)

    await expect(readRestriction(noticeId)).resolves.toMatchObject({ human_review_action: null })
  })

  it('keeps a restriction a moderator already confirmed', async () => {
    const { claimant, noticeId, restriction } = await automaticallyRestrictedNotice()
    await seedEffectiveConfirmation(noticeId, restriction.id, await createTestCopyrightStaff())
    await suspendClaimant(claimant.id)

    await expect(listedBySweep(noticeId)).resolves.toEqual([])
    await assertServiceClaimantSuspensionNoop(noticeId, restriction.id)

    await expect(readRestriction(noticeId)).resolves.toMatchObject({
      human_review_action: 'confirm',
    })
    await expect(readTestClaimantSuspensionReversal(restriction.id)).resolves.toMatchObject({
      recorded: false,
    })
  })

  it('leaves a suspension whose administrator was erased to a moderator', async () => {
    const { claimant, noticeId, restriction } = await automaticallyRestrictedNotice()
    await suspendClaimant(claimant.id)
    await eraseTestSuspendingAdministrator(claimant.id)

    await expect(listedBySweep(noticeId)).resolves.toEqual([])
    await assertServiceClaimantSuspensionNoop(noticeId, restriction.id)

    await expect(readRestriction(noticeId)).resolves.toMatchObject({ human_review_action: null })
  })
})
