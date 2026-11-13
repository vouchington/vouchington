import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { assertOwnedMisuseBatch } from '@voucha/test-helpers/copyright-misuse-batch-subject'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { seedServiceFormDecision } from '@voucha/test-helpers/copyright-service-review-prerequisites'

describe('batched copyright statements', () => {
  it('records one appeal-reversal event per restriction once and ignores a replay or an empty batch', async () => {
    const claimant = await createTestUser()
    const { notice } = await createClearScreenedForm(2, { claimant })
    await seedServiceFormDecision({
      intakeId: notice.intake.id,
      currentUser: await createTestCopyrightStaff(),
      is_accepted: true,
      rationale: 'The notice is complete.',
    })
    const noticeId = notice.intake.copyright_notice_id
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    const restrictionIds = (aggregate?.restrictions ?? []).map(restriction => restriction.id)
    expect(restrictionIds).toHaveLength(2)

    await assertOwnedMisuseBatch(noticeId, restrictionIds)
  })
})
