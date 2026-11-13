import { seedServiceReviewAppeal } from '@voucha/test-helpers/copyright-service-appeal-prerequisite'
import {
  seedServiceFormDecision,
  seedServiceReviewRestriction,
} from '@voucha/test-helpers/copyright-service-review-prerequisites'
import { seedEffectiveAppealDecision } from '@voucha/test-helpers/copyright-effective-review-decisions'
import { assertServiceFormDecisionReplay } from '@voucha/test-helpers/copyright-service-review-replay'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createTestUser } from '@voucha/test-helpers'
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
import { readTestClaimantMisuseSummary } from '@voucha/test-helpers/services/copyright-notices/claimant-abuse-fixtures'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { appendCopyrightGuestFiling, issueCopyrightGuestCapability } from './index.mts'

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
  screeningId?: string,
) {
  const noticeId = notice.intake.copyright_notice_id
  await seedServiceReviewRestriction(notice, moderator, screeningId)
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

  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  async function setSwitch(): Promise<void> {
    if (on) await switchOn()
  }

  it('records a notice that staff reject', async () => {
    await setSwitch()
    const claimant = await createTestUser()
    const { notice, screeningId } = await createClearScreenedForm(1, { claimant })
    if (on)
      await seedServiceReviewRestriction(notice, await createTestCopyrightStaff(), screeningId)

    await seedServiceFormDecision({
      intakeId: notice.intake.id,
      currentUser: await createTestCopyrightStaff(),
      is_accepted: false,
      rationale: 'The claimed work is not described.',
    })

    await expect(readTestClaimantMisuseSummary(claimant.id)).resolves.toEqual({
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
      issuedAt: new Date(),
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

    await expect(readTestClaimantMisuseSummary(claimant.id)).resolves.toEqual({
      ...none,
      notice_withdrawn: 2,
    })
  })

  it('records a restriction that an appeal reverses', async () => {
    await setSwitch()
    const claimant = await createTestUser()
    const poster = await createTestUser()
    const moderator = await createTestCopyrightStaff()
    const { notice, screeningId } = await createClearScreenedForm(1, { claimant, poster })
    const { noticeId, targetId, restrictionId } = await restrict(
      notice,
      moderator,
      on ? screeningId : undefined,
    )
    const appeal = await seedServiceReviewAppeal(poster, noticeId, crypto.randomUUID(), {
      reason: 'I created this image.',
      targetIds: [targetId],
    })

    await seedEffectiveAppealDecision(
      {
        submissionId: appeal.submission.id,
        currentUser: moderator,
        recommendationId: null,
        manualFallbackReason: 'The record is sufficient without a recommendation.',
        rationale: 'The supplied record supports reversal.',
        decisions: [{ restrictionId, action: 'reverse' }],
      },
      noticeId,
    )

    await expect(readTestClaimantMisuseSummary(claimant.id)).resolves.toEqual({
      ...none,
      restriction_reversed_by_appeal: 1,
    })
  })

  it('records a restriction that a counter-notice restoration reverses', async () => {
    await setSwitch()
    const scene = await openHeldCounterNoticeRestore()

    await expect(readTestClaimantMisuseSummary(scene.claimant.id)).resolves.toEqual({
      ...none,
      restriction_reversed_by_counter_notice: 1,
    })
  })
})

describe('claimant misuse ledger scope', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('records nothing for an accepted notice and never suspends a claimant by itself', async () => {
    const claimant = await createTestUser()
    const moderator = await createTestCopyrightStaff()
    const [accepted, ...rejected] = await Promise.all(
      [1, 2, 3, 4].map(() => createClearScreenedForm(1, { claimant })),
    )
    const review = (form: NonNullable<typeof accepted>, isAccepted: boolean) =>
      seedServiceFormDecision({
        intakeId: form.notice.intake.id,
        currentUser: moderator,
        is_accepted: isAccepted,
        rationale: 'A moderator decision.',
      })

    await review(accepted!, true)
    await Promise.all(rejected.map(form => review(form, false)))

    await expect(readTestClaimantMisuseSummary(claimant.id)).resolves.toEqual({
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
      seedServiceFormDecision({
        intakeId: notice.intake.id,
        currentUser: moderator,
        is_accepted: false,
        rationale: 'Not a complete notice.',
      })

    await reject()
    await assertServiceFormDecisionReplay(
      {
        intakeId: notice.intake.id,
        currentUser: moderator,
        is_accepted: false,
        rationale: 'Not a complete notice.',
      },
      notice.intake.copyright_notice_id,
      claimant.id,
    )

    await expect(readTestClaimantMisuseSummary(other.id)).resolves.toEqual(none)
    await expect(readTestClaimantMisuseSummary(claimant.id)).resolves.toEqual({
      ...none,
      notice_rejected: 1,
    })
  })
})
