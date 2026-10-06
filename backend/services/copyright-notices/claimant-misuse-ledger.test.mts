import { describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { useAutomaticWithholdingSwitch } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import {
  admitTestCopyrightEmailWithdrawal,
  createTestCopyrightStaff,
} from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import {
  createClearScreenedForm,
  createSignedInCopyrightForm,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { readCopyrightNoticeTargetId } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getPrivateUserByAny } from '@services/users/get'
import type { prepublishImagePlacementDenial } from '@services/media-delivery-safety'
import { readClaimantMisuseSummary } from './claimant-misuse-summary.mts'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'
import {
  appendCopyrightGuestFiling,
  createCopyrightAppeal,
  issueCopyrightGuestCapability,
  reviewCopyrightAppeal,
  reviewCopyrightFormIntake,
} from './index.mts'

const none = {
  notice_withdrawn: 0,
  notice_rejected: 0,
  restriction_reversed_by_counter_notice: 0,
  restriction_reversed_by_appeal: 0,
}
/** Both states of the automatic-withholding switch: the ledger records the same either way. */
const switchStates = [
  ['off', false],
  ['on', true],
] as const

type ScreenedForm = Awaited<ReturnType<typeof createClearScreenedForm>>['notice']

/** Restricts a clear-screened notice the way the current switch state does, and reads the result. */
async function restrict(
  notice: ScreenedForm,
  moderator: Awaited<ReturnType<typeof createTestCopyrightStaff>>,
  on: boolean,
) {
  const noticeId = notice.intake.copyright_notice_id
  if (on) {
    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)
  } else {
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: moderator,
      is_accepted: true,
      rationale: 'The notice is complete.',
    })
  }
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  if (!aggregate?.restrictions[0]) throw new Error('fixture restriction missing')
  return {
    noticeId,
    restrictionId: aggregate.restrictions[0].id,
    targetId: await readCopyrightNoticeTargetId(noticeId),
  }
}

describe.each(switchStates)('claimant misuse ledger with the switch %s', (_state, on) => {
  const switchOn = useAutomaticWithholdingSwitch()

  async function setSwitch(): Promise<void> {
    if (on) await switchOn()
  }

  it('records a notice that staff reject', async () => {
    await setSwitch()
    const claimant = await createTestUser()
    const { notice } = await createClearScreenedForm(1, { claimant })
    if (on)
      await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: await createTestCopyrightStaff(),
      is_accepted: false,
      rationale: 'The claimed work is not described.',
    })

    await expect(readClaimantMisuseSummary(claimant.id)).resolves.toEqual({
      ...none,
      notice_rejected: 1,
    })
  })

  it('records a notice withdrawn by a guest filing and by an admitted email', async () => {
    await setSwitch()
    const claimant = await createTestUser()
    const staff = await createTestCopyrightStaff()
    const guestNotice = await createSignedInCopyrightForm(1, { claimant })
    const emailNotice = await createSignedInCopyrightForm(1, { claimant })
    const capability = await issueCopyrightGuestCapability({
      currentUser: staff,
      noticeId: guestNotice.intake.copyright_notice_id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    await appendCopyrightGuestFiling({
      noticeId: guestNotice.intake.copyright_notice_id,
      token: capability.token,
      now: new Date(),
      kind: 'withdrawal',
      statement: 'I withdraw this notice.',
    })
    await admitTestCopyrightEmailWithdrawal({
      noticeId: emailNotice.intake.copyright_notice_id,
      moderator: staff,
    })

    await expect(readClaimantMisuseSummary(claimant.id)).resolves.toEqual({
      ...none,
      notice_withdrawn: 2,
    })
  })

  it('records a restriction that an appeal reverses', async () => {
    await setSwitch()
    const claimant = await createTestUser()
    const poster = await createTestUser()
    const moderator = await createTestCopyrightStaff()
    const { notice } = await createClearScreenedForm(1, { claimant, poster })
    const { noticeId, targetId, restrictionId } = await restrict(notice, moderator, on)
    const appeal = await createCopyrightAppeal(poster, noticeId, crypto.randomUUID(), {
      reason: 'I created this image.',
      targetIds: [targetId],
    })

    await reviewCopyrightAppeal({
      submissionId: appeal.submission.id,
      currentUser: moderator,
      recommendationId: null,
      manualFallbackReason: 'The record is sufficient without a recommendation.',
      rationale: 'The supplied record supports reversal.',
      decisions: [{ restrictionId, action: 'reverse' }],
    })

    await expect(readClaimantMisuseSummary(claimant.id)).resolves.toEqual({
      ...none,
      restriction_reversed_by_appeal: 1,
    })
  })

  it('records a restriction that a counter-notice restoration reverses', async () => {
    await setSwitch()
    const publish = vi.fn<typeof prepublishImagePlacementDenial>().mockResolvedValue(undefined)
    const scene = await openHeldCounterNoticeRestore(
      createTestCopyrightDeliveryDependencies(publish),
    )

    await expect(readClaimantMisuseSummary(scene.claimant.id)).resolves.toEqual({
      ...none,
      restriction_reversed_by_counter_notice: 1,
    })
  })
})

describe('claimant misuse ledger scope', () => {
  it('records nothing for an accepted notice and never suspends a claimant by itself', async () => {
    const claimant = await createTestUser()
    const moderator = await createTestCopyrightStaff()
    const [accepted, ...rejected] = await Promise.all(
      [1, 2, 3, 4].map(() => createClearScreenedForm(1, { claimant })),
    )
    const review = (form: NonNullable<typeof accepted>, isAccepted: boolean) =>
      reviewCopyrightFormIntake({
        intakeId: form.notice.intake.id,
        currentUser: moderator,
        is_accepted: isAccepted,
        rationale: 'A moderator decision.',
      })

    await review(accepted!, true)
    await Promise.all(rejected.map(form => review(form, false)))

    await expect(readClaimantMisuseSummary(claimant.id)).resolves.toEqual({
      ...none,
      notice_rejected: 3,
    })
    await expect(getPrivateUserByAny(claimant.id)).resolves.toMatchObject({ suspended_at: null })
  })

  it('keeps one claimant apart from another and counts a replayed review once', async () => {
    const [claimant, other] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = await createTestCopyrightStaff()
    const { notice } = await createClearScreenedForm(1, { claimant })
    const reject = () =>
      reviewCopyrightFormIntake({
        intakeId: notice.intake.id,
        currentUser: moderator,
        is_accepted: false,
        rationale: 'Not a complete notice.',
      })

    await reject()
    await reject()

    await expect(readClaimantMisuseSummary(other.id)).resolves.toEqual(none)
    await expect(readClaimantMisuseSummary(claimant.id)).resolves.toEqual({
      ...none,
      notice_rejected: 1,
    })
  })
})
