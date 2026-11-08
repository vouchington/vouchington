import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  probeTestAdvisoryKeyLocksHeldByBatch,
  recordTestAppealReversalEventsTwice,
} from '@voucha/test-helpers/copyright-batch-statements'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { reviewCopyrightFormIntake } from './index.mts'

describe('batched copyright statements', () => {
  it('records one appeal-reversal event per restriction once and ignores a replay or an empty batch', async () => {
    const claimant = await createTestUser()
    const { notice } = await createClearScreenedForm(2, { claimant })
    await reviewCopyrightFormIntake({
      intakeId: notice.intake.id,
      currentUser: await createTestCopyrightStaff(),
      is_accepted: true,
      rationale: 'The notice is complete.',
    })
    const noticeId = notice.intake.copyright_notice_id
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    const restrictionIds = (aggregate?.restrictions ?? []).map(restriction => restriction.id)
    expect(restrictionIds).toHaveLength(2)

    await expect(recordTestAppealReversalEventsTwice({ noticeId, restrictionIds })).resolves.toBe(2)
  })

  it('holds every advisory lock of a batch until the transaction ends', async () => {
    await expect(
      probeTestAdvisoryKeyLocksHeldByBatch({
        keys: ['copyright-batch-test:b', 'copyright-batch-test:a', 'copyright-batch-test:b'],
        probeKeys: ['copyright-batch-test:a', 'copyright-batch-test:b'],
      }),
    ).resolves.toEqual([false, false])
  })
})
