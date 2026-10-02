import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  eraseTestCopyrightClaimantAccount,
  readTestStaffCaseClaimant,
} from '@voucha/test-helpers/services/copyright-notices/claimant-abuse-fixtures'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { reviewCopyrightFormIntake } from './index.mts'

describe('claimant misuse on the staff case', () => {
  it('shows the claimant ledger summary on any of their notices', async () => {
    const claimant = await createTestUser()
    const [rejected, pending] = await Promise.all([
      createClearScreenedForm(1, { claimant }),
      createClearScreenedForm(1, { claimant }),
    ])
    await reviewCopyrightFormIntake({
      intakeId: rejected.notice.intake.id,
      currentUser: await createTestCopyrightStaff(),
      accepted: false,
      rationale: 'The claimed work is not described.',
    })

    await expect(
      readTestStaffCaseClaimant(pending.notice.intake.copyright_notice_id),
    ).resolves.toEqual(
      expect.objectContaining({
        misuse: {
          notice_withdrawn: 0,
          notice_rejected: 1,
          restriction_reversed_by_counter_notice: 0,
          restriction_reversed_by_appeal: 0,
        },
      }),
    )
  })

  it('shows an empty ledger for a claimant with no recorded misuse', async () => {
    const { notice } = await createClearScreenedForm()

    await expect(
      readTestStaffCaseClaimant(notice.intake.copyright_notice_id),
    ).resolves.toMatchObject({
      misuse: {
        notice_withdrawn: 0,
        notice_rejected: 0,
        restriction_reversed_by_counter_notice: 0,
        restriction_reversed_by_appeal: 0,
      },
    })
  })

  it('has no ledger once no account is linked to the notice', async () => {
    const { notice } = await createClearScreenedForm()
    await eraseTestCopyrightClaimantAccount(notice.intake.copyright_notice_id)

    await expect(
      readTestStaffCaseClaimant(notice.intake.copyright_notice_id),
    ).resolves.toMatchObject({
      misuse: null,
    })
  })
})
